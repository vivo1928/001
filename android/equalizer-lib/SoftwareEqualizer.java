package cn.toside.music.mobile.equalizer;

import android.util.Log;

import java.util.Arrays;

/**
 * 软件均衡器 - 10段参量均衡器
 * 使用 Biquad 滤波器级联实现，完全在软件中处理音频数据，不依赖设备硬件
 */
public class SoftwareEqualizer {
    private static final String TAG = "SoftwareEqualizer";

    // 经典 10 段均衡器频率点 (Hz)
    public static final int[] DEFAULT_FREQS = { 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 };
    public static final int BAND_COUNT = DEFAULT_FREQS.length;
    public static final int MIN_LEVEL_DB = -12000; // -12 dB, 单位: millibel
    public static final int MAX_LEVEL_DB = 12000;  // +12 dB, 单位: millibel

    private BiquadFilter[] leftFilters;
    private BiquadFilter[] rightFilters;
    private final int[] frequencies;
    private int[] gains; // 单位: millibel (1/1000 dB)
    private boolean enabled = false;
    private double sampleRate = 44100.0;
    private static final double Q = 0.707; // ~1/sqrt(2), peaking EQ 推荐 Q 值，减少共振峰值
    // 参考 VLC: EQZ_IN_FACTOR = 0.25f (-12dB)，更大的预衰减让多频段叠加时有更多 headroom
    private static final float PRE_GAIN = 0.25f; // -12dB 预衰减，防止多频段叠加时削波

    // Preamp 输出增益补偿 (线性倍率)，默认 1.0 = 0dB
    private float preamp = 1.0f;

    // Look-ahead Peak Limiter 参数
    private static final int LIMITER_LOOKAHEAD = 192; // ~4ms at 44.1kHz，参考 VLC limiter
    private static final float LIMITER_THRESHOLD = 0.95f; // 峰值阈值
    private static final float LIMITER_RELEASE_COEFF = 0.9995f; // 平滑释放系数
    private float limiterGain = 1.0f; // 当前限幅器增益

    // 单例持有者
    private static SoftwareEqualizer instance;

    public static synchronized SoftwareEqualizer getInstance() {
        if (instance == null) {
            instance = new SoftwareEqualizer();
        }
        return instance;
    }

    public SoftwareEqualizer() {
        this(DEFAULT_FREQS);
    }

    public SoftwareEqualizer(int[] frequencies) {
        this.frequencies = Arrays.copyOf(frequencies, frequencies.length);
        initFilters();
        this.gains = new int[frequencies.length];
        Arrays.fill(this.gains, 0);
        Log.d(TAG, "Software equalizer initialized with " + frequencies.length + " bands, SR=" + sampleRate);
    }

    private void initFilters() {
        leftFilters = new BiquadFilter[frequencies.length];
        rightFilters = new BiquadFilter[frequencies.length];
        for (int i = 0; i < frequencies.length; i++) {
            leftFilters[i] = new BiquadFilter(frequencies[i], 0.0, Q, sampleRate);
            rightFilters[i] = new BiquadFilter(frequencies[i], 0.0, Q, sampleRate);
        }
    }

    public synchronized void setEnabled(boolean enabled) {
        if (this.enabled != enabled) {
            this.enabled = enabled;
            if (!enabled) {
                reset();
            }
            Log.d(TAG, "Equalizer enabled: " + enabled);
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getNumberOfBands() {
        return frequencies.length;
    }

    public int[] getFrequencies() {
        return Arrays.copyOf(frequencies, frequencies.length);
    }

    public int getBandFreq(int band) {
        if (band < 0 || band >= frequencies.length) return 0;
        return frequencies[band];
    }

    public synchronized void setBandLevel(int band, int levelMb) {
        if (band < 0 || band >= frequencies.length) return;
        // Clamp to valid range
        if (levelMb < MIN_LEVEL_DB) levelMb = MIN_LEVEL_DB;
        if (levelMb > MAX_LEVEL_DB) levelMb = MAX_LEVEL_DB;
        gains[band] = levelMb;
        double gainDb = levelMb / 1000.0;
        leftFilters[band].setGainDb(gainDb);
        rightFilters[band].setGainDb(gainDb);
    }

    public synchronized void setBandLevels(int[] levelsMb) {
        int len = Math.min(levelsMb.length, frequencies.length);
        for (int i = 0; i < len; i++) {
            setBandLevel(i, levelsMb[i]);
        }
    }

    public int getBandLevel(int band) {
        if (band < 0 || band >= gains.length) return 0;
        return gains[band];
    }

    public int[] getBandLevels() {
        return Arrays.copyOf(gains, gains.length);
    }

    public synchronized void setSampleRate(double sampleRate) {
        if (Math.abs(this.sampleRate - sampleRate) > 1.0) {
            this.sampleRate = sampleRate;
            for (int i = 0; i < frequencies.length; i++) {
                leftFilters[i].setSampleRate(sampleRate);
                rightFilters[i].setSampleRate(sampleRate);
                leftFilters[i].setGainDb(gains[i] / 1000.0);
                rightFilters[i].setGainDb(gains[i] / 1000.0);
            }
            Log.d(TAG, "Sample rate changed to " + sampleRate + " Hz");
        }
    }

    public double getSampleRate() {
        return sampleRate;
    }

    /**
     * 设置 Preamp 输出增益 (线性倍率)
     * 范围 0.1 ~ 2.0，对应 -20dB ~ +6dB
     */
    public synchronized void setPreamp(float preamp) {
        this.preamp = Math.max(0.1f, Math.min(2.0f, preamp));
        Log.d(TAG, "Preamp set to " + this.preamp);
    }

    public float getPreamp() {
        return preamp;
    }

    public void reset() {
        for (BiquadFilter f : leftFilters) f.reset();
        for (BiquadFilter f : rightFilters) f.reset();
        // 重置限幅器状态
        limiterGain = 1.0f;
        limiterWritePos = 0;
        limiterBufferFilled = 0;
        java.util.Arrays.fill(limiterBuffer, 0.0f);
    }

    /**
     * 处理交错立体声 PCM 数据 (16-bit little-endian short array)
     * 处理链: 预衰减 → 滤波器组 → preamp → tanh软限幅 → look-ahead峰值限幅
     * @param buffer 音频数据
     * @param offset 起始偏移 (short 偏移)
     * @param frameCount 采样帧数 (每帧包含左右两个采样点)
     */
    public synchronized void processStereo(short[] buffer, int offset, int frameCount) {
        if (!enabled) return;

        final float preampLocal = preamp;
        final int end = offset + frameCount * 2;
        for (int i = offset; i < end; i += 2) {
            // 归一化到 [-1, 1]，同时施加 -12dB 预衰减 (参考 VLC EQZ_IN_FACTOR)
            float left = (buffer[i] / 32768.0f) * PRE_GAIN;
            float right = (buffer[i + 1] / 32768.0f) * PRE_GAIN;

            // 通过所有滤波器级联
            for (int b = 0; b < leftFilters.length; b++) {
                left = leftFilters[b].process(left);
                right = rightFilters[b].process(right);
            }

            // Preamp 输出增益补偿
            left *= preampLocal;
            right *= preampLocal;

            // 软限幅 (tanh)，平滑过渡不产生削波失真
            left = (float)Math.tanh(left);
            right = (float)Math.tanh(right);

            // Look-ahead 峰值限幅器
            left = applyLimiter(left);
            right = applyLimiter(right);

            // 转回 16-bit
            buffer[i] = (short)(left * 32767.0f);
            buffer[i + 1] = (short)(right * 32767.0f);
        }
    }

    /**
     * 处理单声道 PCM 数据
     */
    public synchronized void processMono(short[] buffer, int offset, int frameCount) {
        if (!enabled) return;

        final float preampLocal = preamp;
        final int end = offset + frameCount;
        for (int i = offset; i < end; i++) {
            float sample = (buffer[i] / 32768.0f) * PRE_GAIN;
            for (BiquadFilter f : leftFilters) {
                sample = f.process(sample);
            }
            sample *= preampLocal;
            sample = (float)Math.tanh(sample);
            sample = applyLimiter(sample);
            buffer[i] = (short)(sample * 32767.0f);
        }
    }

    /**
     * 处理浮点交错立体声数据
     */
    public synchronized void processFloatStereo(float[] buffer, int offset, int frameCount) {
        if (!enabled) return;

        final float preampLocal = preamp;
        final int end = offset + frameCount * 2;
        for (int i = offset; i < end; i += 2) {
            float left = buffer[i] * PRE_GAIN;
            float right = buffer[i + 1] * PRE_GAIN;

            for (int b = 0; b < leftFilters.length; b++) {
                left = leftFilters[b].process(left);
                right = rightFilters[b].process(right);
            }

            left *= preampLocal;
            right *= preampLocal;

            left = (float)Math.tanh(left);
            right = (float)Math.tanh(right);

            left = applyLimiter(left);
            right = applyLimiter(right);

            buffer[i] = left;
            buffer[i + 1] = right;
        }
    }

    /**
     * 处理字节缓冲区 (16-bit little-endian PCM)
     */
    public synchronized void processStereoBytes(byte[] buffer, int offsetBytes, int frameCount) {
        if (!enabled) return;

        final float preampLocal = preamp;
        for (int i = 0; i < frameCount; i++) {
            int idx = offsetBytes + i * 4;

            // 读取 little-endian short
            short left = (short)((buffer[idx] & 0xFF) | (buffer[idx + 1] << 8));
            short right = (short)((buffer[idx + 2] & 0xFF) | (buffer[idx + 3] << 8));

            float l = (left / 32768.0f) * PRE_GAIN;
            float r = (right / 32768.0f) * PRE_GAIN;

            for (int b = 0; b < leftFilters.length; b++) {
                l = leftFilters[b].process(l);
                r = rightFilters[b].process(r);
            }

            l *= preampLocal;
            r *= preampLocal;

            l = (float)Math.tanh(l);
            r = (float)Math.tanh(r);

            l = applyLimiter(l);
            r = applyLimiter(r);

            short outL = (short)(l * 32767.0f);
            short outR = (short)(r * 32767.0f);

            buffer[idx] = (byte)(outL & 0xFF);
            buffer[idx + 1] = (byte)((outL >> 8) & 0xFF);
            buffer[idx + 2] = (byte)(outR & 0xFF);
            buffer[idx + 3] = (byte)((outR >> 8) & 0xFF);
        }
    }

    /**
     * Look-ahead 峰值限幅器
     * 参考 VLC limiter.c 的实现思路：
     * - 使用环形缓冲区做 look-ahead
     * - 检测前方峰值，提前计算增益衰减
     * - 平滑释放（release envelope），避免增益突变
     *
     * 与 VLC 的区别：VLC 的 limiter 是独立模块，我们这里是内嵌在均衡器处理链中
     * 的简化版，专门处理均衡器引入的过冲。
     */
    private final float[] limiterBuffer = new float[LIMITER_LOOKAHEAD];
    private int limiterWritePos = 0;
    private int limiterBufferFilled = 0;

    private float applyLimiter(float sample) {
        // 将新样本写入环形缓冲区
        limiterBuffer[limiterWritePos] = sample;
        limiterWritePos = (limiterWritePos + 1) % LIMITER_LOOKAHEAD;
        if (limiterBufferFilled < LIMITER_LOOKAHEAD) {
            limiterBufferFilled++;
        }

        // 在缓冲区中查找峰值（look-ahead）
        float peak = 0.0f;
        for (int i = 0; i < limiterBufferFilled; i++) {
            float absVal = Math.abs(limiterBuffer[i]);
            if (absVal > peak) peak = absVal;
        }

        // 计算目标增益
        float targetGain = 1.0f;
        if (peak > LIMITER_THRESHOLD) {
            targetGain = LIMITER_THRESHOLD / peak;
        }

        // 平滑增益过渡：attack 瞬时，release 平滑
        if (targetGain < limiterGain) {
            // 瞬时 attack：峰值超过阈值立即降低增益
            limiterGain = targetGain;
        } else {
            // 平滑 release：增益逐步恢复到 1.0
            limiterGain = limiterGain + (1.0f - limiterGain) * (1.0f - LIMITER_RELEASE_COEFF);
            if (limiterGain > 0.9999f) limiterGain = 1.0f;
        }

        return sample * limiterGain;
    }
}
