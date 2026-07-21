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

public class EqualizerModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;
  private Equalizer equalizer;
  private boolean isEnabled = false;
  private int minBandLevel;
  private int maxBandLevel;
  private int[] bandLevels;
  private short numberOfBands;
  private int audioSessionId = 0;

  EqualizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "EqualizerModule";
  }

  private void initEqualizer() {
    if (equalizer != null) return;
    try {
      equalizer = new Equalizer(0, audioSessionId);
      equalizer.setEnabled(true);
      isEnabled = true;
      numberOfBands = equalizer.getNumberOfBands();
      minBandLevel = equalizer.getBandLevelRange()[0];
      maxBandLevel = equalizer.getBandLevelRange()[1];
      bandLevels = new int[numberOfBands];
      Log.d("Equalizer", "Initialized with " + numberOfBands + " bands, range: " + minBandLevel + " to " + maxBandLevel);
    } catch (Exception e) {
      Log.e("Equalizer", "Failed to init equalizer: " + e.getMessage());
      equalizer = null;
    }
  }

  @ReactMethod
  public void getBandCount(Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(0);
        return;
      }
      promise.resolve((int) numberOfBands);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void getBandInfo(Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(Arguments.createArray());
        return;
      }
      WritableArray bands = Arguments.createArray();
      for (short i = 0; i < numberOfBands; i++) {
        WritableMap band = Arguments.createMap();
        int centerFreq = equalizer.getCenterFreq(i);
        band.putInt("index", i);
        band.putInt("centerFreq", centerFreq);
        band.putInt("minLevel", minBandLevel);
        band.putInt("maxLevel", maxBandLevel);
        bands.pushMap(band);
      }
      promise.resolve(bands);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void setBandLevel(int bandIndex, int levelMb, Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      if (bandIndex >= 0 && bandIndex < numberOfBands) {
        int clamped = Math.max(minBandLevel, Math.min(maxBandLevel, levelMb));
        equalizer.setBandLevel((short) bandIndex, (short) clamped);
        bandLevels[bandIndex] = clamped;
        promise.resolve(true);
      } else {
        promise.resolve(false);
      }
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void setAllBandLevels(String levelsJson, Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      // Parse JSON array: [3, -2, 0, 5, 1, ...]
      org.json.JSONArray jsonArray = new org.json.JSONArray(levelsJson);
      int count = Math.min(jsonArray.length(), numberOfBands);
      for (int i = 0; i < count; i++) {
        int level = jsonArray.getInt(i);
        int clamped = Math.max(minBandLevel, Math.min(maxBandLevel, level));
        equalizer.setBandLevel((short) i, (short) clamped);
        bandLevels[i] = clamped;
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void getBandLevel(int bandIndex, Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(0);
        return;
      }
      if (bandIndex >= 0 && bandIndex < numberOfBands) {
        promise.resolve((int) equalizer.getBandLevel((short) bandIndex));
      } else {
        promise.resolve(0);
      }
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void getCurrentPreset(Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(-1);
        return;
      }
      promise.resolve((int) equalizer.getCurrentPreset());
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void usePreset(short preset, Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      equalizer.usePreset(preset);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void getPresetNames(Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(Arguments.createArray());
        return;
      }
      WritableArray names = Arguments.createArray();
      for (short i = 0; i < equalizer.getNumberOfPresets(); i++) {
        names.pushString(equalizer.getPresetName(i));
      }
      promise.resolve(names);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void setEnabled(boolean enabled, Promise promise) {
    try {
      initEqualizer();
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      equalizer.setEnabled(enabled);
      isEnabled = enabled;
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void isEnabled(Promise promise) {
    try {
      if (equalizer == null) {
        promise.resolve(false);
        return;
      }
      promise.resolve(isEnabled);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void release(Promise promise) {
    try {
      if (equalizer != null) {
        equalizer.setEnabled(false);
        equalizer.release();
        equalizer = null;
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }
}