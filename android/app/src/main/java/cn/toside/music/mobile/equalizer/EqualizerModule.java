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
  private boolean availabilityChecked = false;
  private boolean isAvailable = false;

  EqualizerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "EqualizerModule";
  }

  /**
   * Check if Equalizer is available on this device without actually initializing it.
   * This is a lightweight check that can be called early.
   */
  @ReactMethod
  public void isAvailable(Promise promise) {
    try {
      if (availabilityChecked) {
        promise.resolve(isAvailable);
        return;
      }
      // Try to create a temporary equalizer to check availability
      Equalizer testEq = null;
      try {
        testEq = new Equalizer(0, 0);
        isAvailable = true;
        availabilityChecked = true;
      } catch (UnsupportedOperationException e) {
        Log.w("Equalizer", "Equalizer not supported on this device: " + e.getMessage());
        isAvailable = false;
        availabilityChecked = true;
      } catch (RuntimeException e) {
        Log.w("Equalizer", "Equalizer initialization failed: " + e.getMessage());
        isAvailable = false;
        availabilityChecked = true;
      } finally {
        if (testEq != null) {
          try { testEq.release(); } catch (Exception ignored) {}
        }
      }
      promise.resolve(isAvailable);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  /**
   * Set the audio session ID. Call this before initEqualizer if you have a specific
   * audio session (e.g., from ExoPlayer). Use 0 for global output mix.
   */
  @ReactMethod
  public void setAudioSessionId(int id, Promise promise) {
    try {
      if (equalizer != null) {
        // Already initialized, need to re-create
        equalizer.setEnabled(false);
        equalizer.release();
        equalizer = null;
      }
      audioSessionId = id;
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("ERROR", e.getMessage());
    }
  }

  private synchronized void initEqualizer() {
    if (equalizer != null) return;
    if (!isAvailable && availabilityChecked) return;

    try {
      // Priority 0 = lowest, so system DSP can take over if needed
      equalizer = new Equalizer(0, audioSessionId);
      isEnabled = true;
      numberOfBands = equalizer.getNumberOfBands();
      minBandLevel = equalizer.getBandLevelRange()[0];
      maxBandLevel = equalizer.getBandLevelRange()[1];
      bandLevels = new int[numberOfBands];
      isAvailable = true;
      availabilityChecked = true;
      Log.d("Equalizer", "Initialized with " + numberOfBands + " bands, range: " + minBandLevel + " to " + maxBandLevel + ", sessionId: " + audioSessionId);
    } catch (UnsupportedOperationException e) {
      Log.w("Equalizer", "Equalizer not supported on this device: " + e.getMessage());
      equalizer = null;
      isAvailable = false;
      availabilityChecked = true;
    } catch (RuntimeException e) {
      Log.e("Equalizer", "Failed to init equalizer: " + e.getMessage());
      equalizer = null;
      isAvailable = false;
      availabilityChecked = true;
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
      promise.resolve(0);
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
        try {
          WritableMap band = Arguments.createMap();
          int centerFreq = equalizer.getCenterFreq(i);
          band.putInt("index", i);
          band.putInt("centerFreq", centerFreq);
          band.putInt("minLevel", minBandLevel);
          band.putInt("maxLevel", maxBandLevel);
          bands.pushMap(band);
        } catch (Exception e) {
          Log.w("Equalizer", "Failed to get band " + i + ": " + e.getMessage());
        }
      }
      promise.resolve(bands);
    } catch (Exception e) {
      promise.resolve(Arguments.createArray());
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
      Log.e("Equalizer", "setBandLevel failed: " + e.getMessage());
      promise.resolve(false);
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
      org.json.JSONArray jsonArray = new org.json.JSONArray(levelsJson);
      int count = Math.min(jsonArray.length(), numberOfBands);
      for (int i = 0; i < count; i++) {
        try {
          int level = jsonArray.getInt(i);
          int clamped = Math.max(minBandLevel, Math.min(maxBandLevel, level));
          equalizer.setBandLevel((short) i, (short) clamped);
          bandLevels[i] = clamped;
        } catch (Exception e) {
          Log.w("Equalizer", "setAllBandLevels failed at band " + i + ": " + e.getMessage());
        }
      }
      promise.resolve(true);
    } catch (Exception e) {
      promise.resolve(false);
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
      promise.resolve(0);
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
      promise.resolve(-1);
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
      promise.resolve(false);
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
      short numPresets = equalizer.getNumberOfPresets();
      for (short i = 0; i < numPresets; i++) {
        try {
          names.pushString(equalizer.getPresetName(i));
        } catch (Exception e) {
          Log.w("Equalizer", "getPresetNames failed at " + i + ": " + e.getMessage());
        }
      }
      promise.resolve(names);
    } catch (Exception e) {
      promise.resolve(Arguments.createArray());
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
      Log.e("Equalizer", "setEnabled failed: " + e.getMessage());
      promise.resolve(false);
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
      promise.resolve(false);
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
      promise.resolve(true);
    }
  }
}