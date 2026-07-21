package cn.toside.music.mobile.equalizer;

import android.media.audiofx.Equalizer;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/**
 * 双引擎均衡器模块：
 *   软件引擎 (SoftwareEqualizer) — 纯双二阶滤波器，永远可用，管理所有状态和数学
 *   硬件引擎 (android.media.audiofx.Equalizer) — 如果设备支持，将软件设置同步到硬件 DSP
 *
 * 这样即使设备不支持硬件 Equalizer，软件引擎也能正常工作。
 */
public class EqualizerModule extends ReactContextBaseJavaModule {
  private static final String TAG = "EqualizerModule";

  private final ReactApplicationContext reactContext;

  // 软件引擎 — 永远可用
  private final SoftwareEqualizer softwareEq;
  private boolean softwareEnabled = true;

  // 硬件引擎 — 可选
  private Equalizer hardwareEq;
  private boolean hardwareAvailable = false;
  private boolean hardwareTried = false;
  private int audioSessionId = 0;

  EqualizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    this.softwareEq = new SoftwareEqualizer();
    Log.d(TAG, "Software equalizer initialized with " + softwareEq.getNumberOfBands() + " bands");
  }

  @Override
  public String getName() {
    return "EqualizerModule";
  }

  // ─── 硬件引擎初始化（惰性，仅在首次需要时尝试） ───

  private synchronized void tryInitHardware() {
    if (hardwareTried) return;
    hardwareTried = true;

    try {
      hardwareEq = new Equalizer(0, audioSessionId);
      hardwareAvailable = true;
      hardwareEq.setEnabled(true);
      Log.d(TAG, "Hardware equalizer available, sessionId=" + audioSessionId
        + " bands=" + hardwareEq.getNumberOfBands()
        + " presets=" + hardwareEq.getNumberOfPresets());

      // 将软件设置同步到硬件
      syncToHardware();
    } catch (UnsupportedOperationException e) {
      Log.w(TAG, "Hardware equalizer not supported on this device: " + e.getMessage());
      hardwareEq = null;
      hardwareAvailable = false;
    } catch (RuntimeException e) {
      Log.w(TAG, "Hardware equalizer init failed: " + e.getMessage());
      hardwareEq = null;
      hardwareAvailable = false;
    }
  }

  private void syncToHardware() {
    if (hardwareEq == null) return;
    try {
      hardwareEq.setEnabled(softwareEnabled);
      short hwBands = hardwareEq.getNumberOfBands();
      for (int i = 0; i < Math.min(softwareEq.getNumberOfBands(), hwBands); i++) {
        int gain = softwareEq.getBandLevel(i);
        int hwMin = hardwareEq.getBandLevelRange()[0];
        int hwMax = hardwareEq.getBandLevelRange()[1];
        int clamped = Math.max(hwMin, Math.min(hwMax, gain));
        hardwareEq.setBandLevel((short) i, (short) clamped);
      }
    } catch (Exception e) {
      Log.w(TAG, "syncToHardware failed: " + e.getMessage());
    }
  }

  // ─── React Native 接口 ───

  @ReactMethod
  public void isAvailable(Promise promise) {
    // 软件均衡器永远可用
    promise.resolve(true);
  }

  @ReactMethod
  public void setAudioSessionId(int id, Promise promise) {
    try {
      if (hardwareEq != null) {
        hardwareEq.setEnabled(false);
        hardwareEq.release();
        hardwareEq = null;
        hardwareAvailable = false;
        hardwareTried = false;
      }
      audioSessionId = id;
      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void getBandCount(Promise promise) {
    try {
      promise.resolve(softwareEq.getNumberOfBands());
    } catch (Exception e) {
      promise.resolve(10);
    }
  }

  @ReactMethod
  public void getBandInfo(Promise promise) {
    try {
      WritableArray bands = Arguments.createArray();
      int[] freqs = softwareEq.getCenterFrequencies();
      int minLevel = softwareEq.getMinBandLevel();
      int maxLevel = softwareEq.getMaxBandLevel();

      for (int i = 0; i < freqs.length; i++) {
        WritableMap band = Arguments.createMap();
        band.putInt("index", i);
        band.putInt("centerFreq", freqs[i]);
        band.putInt("minLevel", minLevel);
        band.putInt("maxLevel", maxLevel);
        bands.pushMap(band);
      }
      promise.resolve(bands);
    } catch (Exception e) {
      promise.resolve(Arguments.createArray());
    }
  }

  @ReactMethod
  public void setBandLevel(int bandIndex, int levelMb, Promise promise) {
    try {
      softwareEq.setBandLevel(bandIndex, levelMb);

      // 同步到硬件（如果可用）
      tryInitHardware();
      if (hardwareEq != null) {
        try {
          int hwMin = hardwareEq.getBandLevelRange()[0];
          int hwMax = hardwareEq.getBandLevelRange()[1];
          int clamped = Math.max(hwMin, Math.min(hwMax, levelMb));
          short hwBands = hardwareEq.getNumberOfBands();
          if (bandIndex < hwBands) {
            hardwareEq.setBandLevel((short) bandIndex, (short) clamped);
          }
        } catch (Exception e) {
          Log.w(TAG, "Hardware setBandLevel failed: " + e.getMessage());
        }
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void setAllBandLevels(String levelsJson, Promise promise) {
    try {
      org.json.JSONArray jsonArray = new org.json.JSONArray(levelsJson);
      int count = jsonArray.length();
      int[] levels = new int[count];
      for (int i = 0; i < count; i++) {
        levels[i] = jsonArray.getInt(i);
      }
      softwareEq.setAllBandLevels(levels);

      // 同步到硬件
      tryInitHardware();
      syncToHardware();

      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void getBandLevel(int bandIndex, Promise promise) {
    try {
      promise.resolve(softwareEq.getBandLevel(bandIndex));
    } catch (Exception e) {
      promise.resolve(0);
    }
  }

  @ReactMethod
  public void getCurrentPreset(Promise promise) {
    // 软件均衡器不使用预设，返回 -1（自定义）
    try {
      tryInitHardware();
      if (hardwareEq != null) {
        promise.resolve((int) hardwareEq.getCurrentPreset());
      } else {
        promise.resolve(-1);
      }
    } catch (Exception e) {
      promise.resolve(-1);
    }
  }

  @ReactMethod
  public void usePreset(short preset, Promise promise) {
    try {
      tryInitHardware();
      if (hardwareEq != null) {
        hardwareEq.usePreset(preset);
        promise.resolve(true);
      } else {
        promise.resolve(false);
      }
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void getPresetNames(Promise promise) {
    try {
      tryInitHardware();
      if (hardwareEq != null) {
        WritableArray names = Arguments.createArray();
        short numPresets = hardwareEq.getNumberOfPresets();
        for (short i = 0; i < numPresets; i++) {
          names.pushString(hardwareEq.getPresetName(i));
        }
        promise.resolve(names);
      } else {
        promise.resolve(Arguments.createArray());
      }
    } catch (Exception e) {
      promise.resolve(Arguments.createArray());
    }
  }

  @ReactMethod
  public void setEnabled(boolean enabled, Promise promise) {
    try {
      softwareEnabled = enabled;
      softwareEq.setEnabled(enabled);

      tryInitHardware();
      if (hardwareEq != null) {
        hardwareEq.setEnabled(enabled);
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void isEnabled(Promise promise) {
    try {
      promise.resolve(softwareEnabled);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void release(Promise promise) {
    try {
      softwareEq.release();
      if (hardwareEq != null) {
        hardwareEq.setEnabled(false);
        hardwareEq.release();
        hardwareEq = null;
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(true);
    }
  }
}