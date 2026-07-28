package cn.toside.music.mobile.equalizer;

/**
 * Biquad IIR Filter - RBJ Audio EQ Cookbook 峰值均衡器实现
 * 参考: https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html
 */
public class BiquadFilter {
    private double b0, b1, b2, a1, a2;
    private double x1, x2, y1, y2; // 延迟缓冲区

    private final double centerFreq;
    private double gainDb;
    private final double q;
    private double sampleRate;

    public BiquadFilter(double centerFreq, double gainDb, double q, double sampleRate) {
        this.centerFreq = centerFreq;
        this.gainDb = gainDb;
        this.q = q;
        this.sampleRate = sampleRate;
        reset();
        recalcCoefficients();
    }

    public void setGainDb(double gainDb) {
        if (this.gainDb != gainDb) {
            this.gainDb = gainDb;
            recalcCoefficients();
        }
    }

    public void setSampleRate(double sampleRate) {
        if (this.sampleRate != sampleRate) {
            this.sampleRate = sampleRate;
            recalcCoefficients();
        }
    }

    public void reset() {
        x1 = 0;
        x2 = 0;
        y1 = 0;
        y2 = 0;
    }

    /**
     * 重新计算滤波器系数 (Peaking EQ)
     */
    public void recalcCoefficients() {
        double A = Math.pow(10.0, gainDb / 40.0);
        double omega = 2.0 * Math.PI * centerFreq / sampleRate;
        double sinOmega = Math.sin(omega);
        double cosOmega = Math.cos(omega);
        double alpha = sinOmega / (2.0 * q);

        double b0_raw = 1.0 + alpha * A;
        double b1_raw = -2.0 * cosOmega;
        double b2_raw = 1.0 - alpha * A;
        double a0_raw = 1.0 + alpha / A;
        double a1_raw = -2.0 * cosOmega;
        double a2_raw = 1.0 - alpha / A;

        // 归一化
        b0 = b0_raw / a0_raw;
        b1 = b1_raw / a0_raw;
        b2 = b2_raw / a0_raw;
        a1 = a1_raw / a0_raw;
        a2 = a2_raw / a0_raw;
    }

    /**
     * 处理单个采样点
     */
    public float process(float x) {
        float y = (float)(b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2);
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        return y;
    }
}
