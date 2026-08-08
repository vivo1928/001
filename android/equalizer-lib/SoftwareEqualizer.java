package cn.toside.music.mobile.equalizer;

import android.util.Log;

import java.util.Arrays;

/**
 * 软件均衡器 - 10段均衡器
 * 采用 VLC 参考实现（vlc_eq.c）的并联带通结构：
 *   out = EQZ_OUT_FACTOR * (EQZ_IN_FACTOR * x + Σ(带通_i * amp_i))
 * 每个频段是窄带谐振滤波器，只在其中心频率附近贡献增益，频段之间互不叠加，
 * 0dB 频段 amp=0 完全旁路。不使用 tanh/限幅器，避免非线性削波导致的音色失真。
 */
public class SoftwareEqualizer {
    private static final String TAG = "SoftwareEqualizer";

    // 经典 10 段均衡器频率点 (Hz)
    public static final int[] DEFAULT_FREQS = { 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 };
    public static final int BAND_COUNT = DEFAULT_FREQS.length;
    public static final int MIN_LEVEL_DB = -12000; // -12 dB, 单位: millibel
    public static final int MAX_LEVEL_DB = 12000;  // +12 dB, 单位: millibel

    // 参考 VLC: EQZ_IN_FACTOR = 0.25f (-12dB) 输入预衰减，
    // EQZ_OUT_FACTOR = 1/0.25 = 4.0 (+12dB) 输出补偿，使全频段 0dB 时输出音量与输入一致
    private static final float EQZ_IN_FACTOR = 0.25f;
    private static final float EQZ_OUT_FACTOR = 1.0f / EQZ_IN_FACTOR;

    // VLC 滤波器带宽参数 (eqz-octave-percent 默认 1.0，一倍频程)
    private static final float OCTAVE_FACTOR = (float)Math.pow(2.0, 0.5);
    private static final float OCTAVE_FACTOR_1 = 0.5f * (OCTAVE_FACTOR + 1.0f);
    private static final float OCTAVE_FACTOR_2 = 0.5f * (OCTAVE_FACTOR - 1.0f);

    private final int[] frequencies;
    private int[] gains; // 单位: millibel (1/1000 dB)

    // 每频段滤波器系数
    private float[] alpha;
    private float[] beta;
    private float[] gamma;
    // 每频段线性增益 (amp = EQZ_IN_FACTOR * (10^(dB/20) - 1))
    private float[] amps;

    // 滤波器状态: 每声道每频段 y1/y2，每声道上一帧输入 x1
    private final float[][] y1 = new float[2][];
    private final float[][] y2 = new float[2][];
    private final float[] x1 = new float[2];

    private boolean enabled = false;
    private double sampleRate = 44100.0;

    // Preamp 输出增益补偿 (线性倍率)，默认 1.0 = 0dB
    private float preamp = 1.0f;

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
        int bandCount = frequencies.length;
        y1[0] = new float[bandCount];
        y1[1] = new float[bandCount];
        y2[0] = new float[bandCount];
        y2[1] = new float[bandCount];
        this.gains = new int[bandCount];
        Arrays.fill(this.gains, 0);
        alpha = new float[bandCount];
        beta = new float[bandCount];
        gamma = new float[bandCount];
        amps = new float[bandCount];
        updateCoeffs();
        updateAmps();
        Log.d(TAG, "Software equalizer initialized (VLC parallel bandpass) with " + bandCount + " bands, SR=" + sampleRate);
    }

    // 计算各频段 VLC 谐振滤波器系数 (对应 vlc_eq.c 的 EqzCoeffs)
    private void updateCoeffs() {
        float rate = (float)sampleRate;
        for (int i = 0; i < frequencies.length; i++) {
            float theta1 = (float)(2.0 * Math.PI * frequencies[i] / rate);
            float theta2 = theta1 / OCTAVE_FACTOR;
            float sin = (float)Math.sin(theta2);
            float sinPrd = (float)(Math.sin(theta2 * OCTAVE_FACTOR_1) * Math.sin(theta2 * OCTAVE_FACTOR_2));
            float sinHlf = sin * 0.5f;
            float den = sinHlf + sinPrd;
            alpha[i] = sinPrd / den;
            beta[i] = (sinHlf - sinPrd) / den;
            gamma[i] = sin * (float)Math.cos(theta1) / den;
        }
    }

    // 更新各频段线性增益 (对应 vlc_eq.c 的 EqzConvertdB)
    private void updateAmps() {
        for (int i = 0; i < frequencies.length; i++) {
            amps[i] = convertDbToAmp(gains[i] / 1000.0);
        }
    }

    private float convertDbToAmp(double db) {
        if (db > 20.0) db = 20.0;
        if (db < -20.0) db = -20.0;
        return EQZ_IN_FACTOR * ((float)Math.pow(10.0, db / 20.0) - 1.0f);
    }

    // 处理单样本 (对应 vlc_eq.c 的 EqzFilter)
    private float processSample(float x, int ch) {
        float o = 0.0f;
        final int bandCount = frequencies.length;
        for (int b = 0; b < bandCount; b++) {
            float y = alpha[b] * (x - x1[ch]) + gamma[b] * y1[ch][b] - beta[b] * y2[ch][b];
            y2[ch][b] = y1[ch][b];
            y1[ch][b] = y;
            o += y * amps[b];
        }
        x1[ch] = x;
        float out = EQZ_OUT_FACTOR * (EQZ_IN_FACTOR * x + o) * preamp;
        return out > 1.0f ? 1.0f : (out < -1.0f ? -1.0f : out);
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
        amps[band] = convertDbToAmp(levelMb / 1000.0);
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
            updateCoeffs();
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
        for (int ch = 0; ch < 2; ch++) {
            x1[ch] = 0.0f;
            Arrays.fill(y1[ch], 0.0f);
            Arrays.fill(y2[ch], 0.0f);
        }
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
            float left = processSample(buffer[i] / 32768.0f, 0);
            float right = processSample(buffer[i + 1] / 32768.0f, 1);
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
            float sample = processSample(buffer[i] / 32768.0f, 0);
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
            buffer[i] = processSample(buffer[i], 0);
            buffer[i + 1] = processSample(buffer[i + 1], 1);
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

            float l = processSample(left / 32768.0f, 0);
            float r = processSample(right / 32768.0f, 1);

            short outL = (short)(l * 32767.0f);
            short outR = (short)(r * 32767.0f);

            buffer[idx] = (byte)(outL & 0xFF);
            buffer[idx + 1] = (byte)((outL >> 8) & 0xFF);
            buffer[idx + 2] = (byte)(outR & 0xFF);
            buffer[idx + 3] = (byte)((outR >> 8) & 0xFF);
        }
    }
}
