package cn.toside.music.mobile.equalizer;

import android.util.Log;

/**
 * 纯软件均衡器引擎。
 * 使用一连串 BiquadFilter（双二阶滤波器）实现多频段均衡。
 * 不依赖任何 Android hardware DSP，纯 CPU 数学运算，兼容所有设备。
 *
 * 默认使用 10 段均衡器，覆盖 31Hz - 16kHz 的经典频率点。
 * - 增益范围：-12dB ~ +12dB
 * - Q 值：1.414（Butterworth 风格，平滑过渡）
 * - 采样率：44100Hz（标准 CD 音质）
 */
public class SoftwareEqualizer {
  private static final String TAG = "SoftwareEqualizer";

  // 经典 10 段均衡器频率点
  public static final int[] DEFAULT_FREQS = { 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 };

  private BiquadFilter[] filters;
  private int[] frequencies;
  private int[] gains; // 单位：millibel (1/1000 dB)
  private boolean enabled = true;
  private double sampleRate = 44100.0;
  private double q = 1.414; // ~sqrt(2), Butterworth Q

  public SoftwareEqualizer() {
    this(DEFAULT_FREQS);
  }

  public SoftwareEqualizer(int[] frequencies) {
    this.frequencies = frequencies;
    this.filters = new BiquadFilter[frequencies.length];
    this.gains = new int[frequencies.length];
    for (int i = 0; i < frequencies.length; i++) {
      this.filters[i] = new BiquadFilter(frequencies[i], 0.0, q, sampleRate);
      this.gains[i] = 0;
    }
    Log.d(TAG, "Initialized software equalizer with " + frequencies.length + " bands");
  }

  public int getNumberOfBands() {
    return frequencies.length;
  }

  public int[] getCenterFrequencies() {
    return frequencies.clone();
  }

  public int getMinBandLevel() {
    return -12000; // -12 dB in millibels
  }

  public int getMaxBandLevel() {
    return 12000;  // +12 dB in millibels
  }

  public void setBandLevel(int band, int levelMb) {
    if (band < 0 || band >= filters.length) return;
    gains[band] = levelMb;
    double gainDb = levelMb / 1000.0;
    filters[band].setGainDb(gainDb);
  }

  public int getBandLevel(int band) {
    if (band < 0 || band >= gains.length) return 0;
    return gains[band];
  }

  public void setAllBandLevels(int[] levelsMb) {
    int count = Math.min(levelsMb.length, filters.length);
    for (int i = 0; i < count; i++) {
      setBandLevel(i, levelsMb[i]);
    }
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public boolean isEnabled() {
    return enabled;
  }

  public void setSampleRate(double sampleRate) {
    this.sampleRate = sampleRate;
    for (BiquadFilter f : filters) {
      f.setSampleRate(sampleRate);
    }
  }

  /**
   * 处理单个声道的一帧 PCM 数据
   */
  public short[] processFrame(short[] frame) {
    if (!enabled) return frame;
    for (BiquadFilter filter : filters) {
      filter.process(frame, 0, frame.length);
    }
    return frame;
  }

  /**
   * 处理立体声 PCM 数据（交错格式：L,R,L,R,...）
   */
  public short[] processStereo(short[] buffer, int offset, int frameCount) {
    if (!enabled) return buffer;

    // 对每个声道分别处理
    // 左声道: 偶数索引
    // 右声道: 奇数索引
    for (int i = 0; i < frameCount; i++) {
      int leftIdx = offset + i * 2;
      int rightIdx = leftIdx + 1;

      double left = buffer[leftIdx] / 32768.0;
      double right = buffer[rightIdx] / 32768.0;

      for (BiquadFilter filter : filters) {
        left = filter.process(left);
        right = filter.process(right);
      }

      // 软限幅
      if (left > 1.0) left = 1.0;
      if (left < -1.0) left = -1.0;
      if (right > 1.0) right = 1.0;
      if (right < -1.0) right = -1.0;

      buffer[leftIdx] = (short) (left * 32767.0);
      buffer[rightIdx] = (short) (right * 32767.0);
    }

    return buffer;
  }

  public void reset() {
    for (BiquadFilter f : filters) {
      f.reset();
    }
  }

  public void release() {
    enabled = false;
    filters = null;
    gains = null;
  }
}