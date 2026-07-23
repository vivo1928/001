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
    private static final double Q = 1.4142; // ~sqrt(2), Butterworth Q 值

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

    public void reset() {
        for (BiquadFilter f : leftFilters) f.reset();
        for (BiquadFilter f : rightFilters) f.reset();
    }

    /**
     * 处理交错立体声 PCM 数据 (16-bit little-endian short array)
     * @param buffer 音频数据
     * @param offset 起始偏移 (short 偏移)
     * @param frameCount 采样帧数 (每帧包含左右两个采样点)
     */
    public synchronized void processStereo(short[] buffer, int offset, int frameCount) {
        if (!enabled) return;

        final int end = offset + frameCount * 2;
        for (int i = offset; i < end; i += 2) {
            // 归一化到 [-1, 1]
            float left = buffer[i] / 32768.0f;
            float right = buffer[i + 1] / 32768.0f;

            // 通过所有滤波器级联
            for (int b = 0; b < leftFilters.length; b++) {
                left = leftFilters[b].process(left);
                right = rightFilters[b].process(right);
            }

            // 软限幅 (tanh 风格)
            if (left > 1.0f) left = 1.0f;
            if (left < -1.0f) left = -1.0f;
            if (right > 1.0f) right = 1.0f;
            if (right < -1.0f) right = -1.0f;

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

        final int end = offset + frameCount;
        for (int i = offset; i < end; i++) {
            float sample = buffer[i] / 32768.0f;
            for (BiquadFilter f : leftFilters) {
                sample = f.process(sample);
            }
            if (sample > 1.0f) sample = 1.0f;
            if (sample < -1.0f) sample = -1.0f;
            buffer[i] = (short)(sample * 32767.0f);
        }
    }

    /**
     * 处理浮点交错立体声数据
     */
    public synchronized void processFloatStereo(float[] buffer, int offset, int frameCount) {
        if (!enabled) return;

        final int end = offset + frameCount * 2;
        for (int i = offset; i < end; i += 2) {
            float left = buffer[i];
            float right = buffer[i + 1];

            for (int b = 0; b < leftFilters.length; b++) {
                left = leftFilters[b].process(left);
                right = rightFilters[b].process(right);
            }

            // 软限幅
            if (left > 1.0f) left = 1.0f;
            if (left < -1.0f) left = -1.0f;
            if (right > 1.0f) right = 1.0f;
            if (right < -1.0f) right = -1.0f;

            buffer[i] = left;
            buffer[i + 1] = right;
        }
    }

    /**
     * 处理字节缓冲区 (16-bit little-endian PCM)
     */
    public synchronized void processStereoBytes(byte[] buffer, int offsetBytes, int frameCount) {
        if (!enabled) return;

        for (int i = 0; i < frameCount; i++) {
            int idx = offsetBytes + i * 4;

            // 读取 little-endian short
            short left = (short)((buffer[idx] & 0xFF) | (buffer[idx + 1] << 8));
            short right = (short)((buffer[idx + 2] & 0xFF) | (buffer[idx + 3] << 8));

            float l = left / 32768.0f;
            float r = right / 32768.0f;

            for (int b = 0; b < leftFilters.length; b++) {
                l = leftFilters[b].process(l);
                r = rightFilters[b].process(r);
            }

            if (l > 1.0f) l = 1.0f;
            if (l < -1.0f) l = -1.0f;
            if (r > 1.0f) r = 1.0f;
            if (r < -1.0f) r = -1.0f;

            short outL = (short)(l * 32767.0f);
            short outR = (short)(r * 32767.0f);

            buffer[idx] = (byte)(outL & 0xFF);
            buffer[idx + 1] = (byte)((outL >> 8) & 0xFF);
            buffer[idx + 2] = (byte)(outR & 0xFF);
            buffer[idx + 3] = (byte)((outR >> 8) & 0xFF);
        }
    }
}
