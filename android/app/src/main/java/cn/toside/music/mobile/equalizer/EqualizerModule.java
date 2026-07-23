package cn.toside.music.mobile.equalizer;

import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import com.guichaguri.trackplayer.service.MusicManager;

/**
 * React Native 均衡器原生模块
 * 提供软件均衡器控制接口，兼容所有 Android 设备
 */
public class EqualizerModule extends ReactContextBaseJavaModule {
    private static final String TAG = "EqualizerModule";
    private final SoftwareEqualizer equalizer;

    public EqualizerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.equalizer = SoftwareEqualizer.getInstance();
        Log.d(TAG, "Equalizer module initialized, bands=" + equalizer.getNumberOfBands());
    }

    @NonNull
    @Override
    public String getName() {
        return "EqualizerModule";
    }

    /**
     * 检查均衡器是否可用（软件均衡器永远可用）
     */
    @ReactMethod
    public void isAvailable(Promise promise) {
        promise.resolve(true);
    }

    /**
     * 启用/禁用均衡器
     */
    @ReactMethod
    public void setEnabled(boolean enabled, Promise promise) {
        try {
            equalizer.setEnabled(enabled);
            // 均衡器启用时禁用音频offload（offload绕过AudioProcessor链）
            // 禁用时恢复用户原始设置
            try {
                if (enabled) {
                    MusicManager.setAudioOffloadEnabled(false);
                } else {
                    MusicManager.restoreOriginalAudioOffload();
                }
            } catch (Throwable t) {
                Log.w(TAG, "Failed to set audio offload: " + t.getMessage());
            }
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "setEnabled error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 获取均衡器启用状态
     */
    @ReactMethod
    public void getEnabled(Promise promise) {
        promise.resolve(equalizer.isEnabled());
    }

    /**
     * 获取频段数量
     */
    @ReactMethod
    public void getNumberOfBands(Promise promise) {
        promise.resolve(equalizer.getNumberOfBands());
    }

    /**
     * 获取频段信息（中心频率、最小/最大增益）
     */
    @ReactMethod
    public void getBandInfo(Promise promise) {
        try {
            WritableArray bands = Arguments.createArray();
            int[] freqs = equalizer.getFrequencies();
            for (int i = 0; i < freqs.length; i++) {
                WritableMap band = Arguments.createMap();
                band.putInt("index", i);
                band.putInt("centerFreq", freqs[i]);
                band.putInt("minLevel", SoftwareEqualizer.MIN_LEVEL_DB); // -12000 mB = -12 dB
                band.putInt("maxLevel", SoftwareEqualizer.MAX_LEVEL_DB); // 12000 mB = 12 dB
                band.putInt("currentLevel", equalizer.getBandLevel(i));
                bands.pushMap(band);
            }
            promise.resolve(bands);
        } catch (Exception e) {
            Log.e(TAG, "getBandInfo error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 设置单个频段增益
     * @param band 频段索引
     * @param levelMb 增益值（毫分贝，1 dB = 1000 mB），范围 -12000 ~ 12000
     */
    @ReactMethod
    public void setBandLevel(int band, int levelMb, Promise promise) {
        try {
            equalizer.setBandLevel(band, levelMb);
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "setBandLevel error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 批量设置所有频段增益（用于预设）
     * @param levelsMb 增益数组（毫分贝）
     */
    @ReactMethod
    public void setBandLevels(ReadableArray levelsMb, Promise promise) {
        try {
            int[] levels = new int[levelsMb.size()];
            for (int i = 0; i < levelsMb.size(); i++) {
                levels[i] = levelsMb.getInt(i);
            }
            equalizer.setBandLevels(levels);
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "setBandLevels error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 获取所有频段当前增益
     */
    @ReactMethod
    public void getBandLevels(Promise promise) {
        try {
            WritableArray levels = Arguments.createArray();
            int[] gains = equalizer.getBandLevels();
            for (int gain : gains) {
                levels.pushInt(gain);
            }
            promise.resolve(levels);
        } catch (Exception e) {
            Log.e(TAG, "getBandLevels error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 重置所有频段为 0 dB（平坦）
     */
    @ReactMethod
    public void reset(Promise promise) {
        try {
            int[] zeros = new int[equalizer.getNumberOfBands()];
            equalizer.setBandLevels(zeros);
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "reset error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 获取当前采样率
     */
    @ReactMethod
    public void getSampleRate(Promise promise) {
        promise.resolve((int)equalizer.getSampleRate());
    }
}
