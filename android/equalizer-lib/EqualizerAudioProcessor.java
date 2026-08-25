package cn.toside.music.mobile.equalizer;

import android.util.Log;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.util.UnstableApi;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;

/**
 * ExoPlayer AudioProcessor 实现，将 SoftwareEqualizer 集成到音频播放链中
 * 使用软件DSP处理音频，不依赖任何硬件均衡器，兼容所有设备
 */
@UnstableApi
public class EqualizerAudioProcessor implements AudioProcessor {
    private static final String TAG = "EqAudioProcessor";

    private int sampleRateHz = 44100;
    private int channelCount = 2;
    private int encoding = C.ENCODING_PCM_16BIT;
    private boolean inputEnded = false;

    private ByteBuffer outputBuffer = EMPTY_BUFFER;
    private ByteBuffer pendingOutputBuffer;

    private final SoftwareEqualizer equalizer;

    // 可复用的处理缓冲区
    private short[] processingBuffer;
    private int processingBufferCapacity = 0;

    public EqualizerAudioProcessor() {
        this.equalizer = SoftwareEqualizer.getInstance();
    }

    @Override
    public AudioFormat configure(AudioFormat inputAudioFormat) throws UnhandledAudioFormatException {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT
                && inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT
                && inputAudioFormat.encoding != C.ENCODING_PCM_24BIT
                && inputAudioFormat.encoding != C.ENCODING_PCM_32BIT) {
            throw new UnhandledAudioFormatException(inputAudioFormat);
        }
        this.sampleRateHz = inputAudioFormat.sampleRate;
        this.channelCount = inputAudioFormat.channelCount;
        this.encoding = inputAudioFormat.encoding;

        // 通知均衡器采样率变化
        equalizer.setSampleRate(sampleRateHz);
        Log.d(TAG, "Configured: SR=" + sampleRateHz + " channels=" + channelCount + " encoding=" + encoding);

        return inputAudioFormat;
    }

    @Override
    public boolean isActive() {
        // 恒返回 true：让均衡器处理器常驻音频链，AudioTrack 配置恒定，
        // 避免关闭均衡器时 isActive 翻转触发 media3 反复重建 AudioTrack
        // 导致一卡一卡。均衡器关闭时由 queueInput 内部透传（安全拷贝），
        // 不改变采样/声道，音质无损。
        return true;
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int position = input.position();
        int limit = input.limit();
        int remaining = limit - position;
        if (remaining == 0) return;

        if (!equalizer.isEnabled() || channelCount > 2) {
            // 均衡器未启用时透传
            // 多声道（>2，如 Dolby Atmos 5.1/7.1）不做均衡处理，直接透传
            if (pendingOutputBuffer == null || pendingOutputBuffer.capacity() < remaining) {
                pendingOutputBuffer = ByteBuffer.allocateDirect(remaining).order(ByteOrder.LITTLE_ENDIAN);
            }
            pendingOutputBuffer.clear();
            input.limit(limit);
            input.position(position);
            pendingOutputBuffer.put(input);
            input.position(limit);
            pendingOutputBuffer.position(0);
            pendingOutputBuffer.limit(remaining);
            outputBuffer = pendingOutputBuffer;
            return;
        }

        boolean isFloat = encoding == C.ENCODING_PCM_FLOAT;
        boolean is24Bit = encoding == C.ENCODING_PCM_24BIT;
        boolean is32Bit = encoding == C.ENCODING_PCM_32BIT;
        int bytesPerSample = isFloat || is32Bit ? 4 : (is24Bit ? 3 : 2);
        int frameSize = channelCount * bytesPerSample;
        int frameCount = remaining / frameSize;
        int totalSamples = frameCount * channelCount;

        // 确保处理缓冲区足够大
        if (processingBuffer == null || processingBufferCapacity < totalSamples) {
            processingBuffer = new short[totalSamples];
            processingBufferCapacity = totalSamples;
        }

        // 将输入数据转为 16-bit short 数组
        if (isFloat) {
            for (int i = 0; i < totalSamples; i++) {
                float f = input.getFloat(position + i * 4);
                float clamped = Math.max(-1f, Math.min(1f, f));
                processingBuffer[i] = (short)(clamped * 32767f);
            }
        } else if (is32Bit) {
            for (int i = 0; i < totalSamples; i++) {
                int s = input.getInt(position + i * 4);
                processingBuffer[i] = (short)(s >> 16);
            }
        } else if (is24Bit) {
            for (int i = 0; i < totalSamples; i++) {
                int off = position + i * 3;
                int s = (input.get(off) & 0xFF)
                      | ((input.get(off + 1) & 0xFF) << 8)
                      | ((input.get(off + 2) & 0xFF) << 16);
                if ((s & 0x800000) != 0) s |= 0xFF000000;
                processingBuffer[i] = (short)(s >> 8);
            }
        } else {
            ShortBuffer inputShortBuf = input.asShortBuffer();
            inputShortBuf.get(processingBuffer, 0, totalSamples);
        }

        // 处理音频数据
        if (channelCount == 2) {
            equalizer.processStereo(processingBuffer, 0, frameCount);
        } else if (channelCount == 1) {
            equalizer.processMono(processingBuffer, 0, frameCount);
        } else {
            equalizer.processStereo(processingBuffer, 0, frameCount);
        }

        // 输出缓冲区大小：处理后的 16-bit 或原格式
        int outputSize = frameCount * frameSize;
        if (pendingOutputBuffer == null || pendingOutputBuffer.capacity() < outputSize) {
            pendingOutputBuffer = ByteBuffer.allocateDirect(outputSize).order(ByteOrder.LITTLE_ENDIAN);
        }
        pendingOutputBuffer.clear();

        // 将处理后的数据写入输出
        if (isFloat) {
            for (int i = 0; i < totalSamples; i++) {
                float f = processingBuffer[i] / 32767f;
                pendingOutputBuffer.putFloat(f);
            }
        } else if (is32Bit) {
            for (int i = 0; i < totalSamples; i++) {
                pendingOutputBuffer.putInt(processingBuffer[i] << 16);
            }
        } else if (is24Bit) {
            for (int i = 0; i < totalSamples; i++) {
                int s = processingBuffer[i] << 8;
                pendingOutputBuffer.put((byte)(s & 0xFF));
                pendingOutputBuffer.put((byte)((s >> 8) & 0xFF));
                pendingOutputBuffer.put((byte)((s >> 16) & 0xFF));
            }
        } else {
            ShortBuffer outputShortBuf = pendingOutputBuffer.asShortBuffer();
            outputShortBuf.put(processingBuffer, 0, totalSamples);
            pendingOutputBuffer.position(outputSize);
        }
        pendingOutputBuffer.limit(pendingOutputBuffer.position());
        pendingOutputBuffer.position(0);

        // 消费输入数据
        input.position(limit);
        outputBuffer = pendingOutputBuffer;
    }

    @Override
    public void queueEndOfStream() {
        inputEnded = true;
    }

    @Override
    public ByteBuffer getOutput() {
        ByteBuffer output = outputBuffer;
        outputBuffer = EMPTY_BUFFER;
        return output;
    }

    @Override
    public boolean isEnded() {
        return inputEnded && outputBuffer == EMPTY_BUFFER;
    }

    @Override
    public void flush() {
        outputBuffer = EMPTY_BUFFER;
        inputEnded = false;
        equalizer.reset();
    }

    @Override
    public void reset() {
        flush();
        sampleRateHz = 44100;
        channelCount = 2;
        encoding = C.ENCODING_PCM_16BIT;
        processingBuffer = null;
        processingBufferCapacity = 0;
        pendingOutputBuffer = null;
    }
}
