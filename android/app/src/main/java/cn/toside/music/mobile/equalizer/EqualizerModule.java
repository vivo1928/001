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
     * 注意：不在运行时切换硬件 offload。均衡器处理器常驻音频链（isActive 恒 true），
     * 关闭时内部透传，避免播放中重建解码器/输出管线导致卡顿与变调。
     */
    @ReactMethod
    public void setEnabled(boolean enabled, Promise promise) {
        try {
            equalizer.setEnabled(enabled);
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

    /**
     * 设置 Preamp 输出增益（线性倍率）
     * @param preamp 线性增益，范围 0.1 ~ 2.0，默认 1.0
     *               0.5 = -6dB, 1.0 = 0dB, 2.0 = +6dB
     */
    @ReactMethod
    public void setPreamp(double preamp, Promise promise) {
        try {
            equalizer.setPreamp((float) preamp);
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "setPreamp error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * 获取当前 Preamp 增益值
     */
    @ReactMethod
    public void getPreamp(Promise promise) {
        try {
            promise.resolve((double) equalizer.getPreamp());
        } catch (Exception e) {
            Log.e(TAG, "getPreamp error", e);
            promise.reject("ERROR", e.getMessage());
        }
    }
}
