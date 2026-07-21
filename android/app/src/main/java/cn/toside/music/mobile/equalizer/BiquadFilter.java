package cn.toside.music.mobile.equalizer;

/**
 * 纯软件双二阶（Biquad）峰值均衡滤波器。
 * 不依赖任何 Android 硬件 DSP，纯数学运算，兼容所有设备。
 *
 * 传递函数：H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
 * 差分方程：y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
 */
public class BiquadFilter {
  private double b0, b1, b2, a1, a2;
  private double x1, x2, y1, y2; // delay buffers

  private double centerFreq;
  private double gainDb;
  private double q;
  private double sampleRate;

  public BiquadFilter(double centerFreq, double gainDb, double q, double sampleRate) {
    this.centerFreq = centerFreq;
    this.gainDb = gainDb;
    this.q = q;
    this.sampleRate = sampleRate;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    recalcCoefficients();
  }

  /**
   * 重新计算峰值均衡器系数
   * 基于 RBJ Audio EQ Cookbook 公式
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

    // 归一化系数
    b0 = b0_raw / a0_raw;
    b1 = b1_raw / a0_raw;
    b2 = b2_raw / a0_raw;
    a1 = a1_raw / a0_raw;
    a2 = a2_raw / a0_raw;
  }

  public void setGainDb(double gainDb) {
    this.gainDb = gainDb;
    recalcCoefficients();
  }

  public void setCenterFreq(double centerFreq) {
    this.centerFreq = centerFreq;
    recalcCoefficients();
  }

  public void setQ(double q) {
    this.q = q;
    recalcCoefficients();
  }

  public void setSampleRate(double sampleRate) {
    this.sampleRate = sampleRate;
    recalcCoefficients();
  }

  public double getGainDb() { return gainDb; }
  public double getCenterFreq() { return centerFreq; }

  /**
   * 处理单个采样点
   */
  public double process(double x) {
    double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  }

  /**
   * 批量处理 PCM 采样数据（short 格式）
   */
  public void process(short[] buffer, int offset, int count) {
    for (int i = offset; i < offset + count; i++) {
      double x = buffer[i] / 32768.0;
      double y = process(x);
      // 软限幅，防止削波
      if (y > 1.0) y = 1.0;
      if (y < -1.0) y = -1.0;
      buffer[i] = (short) (y * 32767.0);
    }
  }

  /**
   * 重置滤波器状态
   */
  public void reset() {
    x1 = 0;
    x2 = 0;
    y1 = 0;
    y2 = 0;
  }
}