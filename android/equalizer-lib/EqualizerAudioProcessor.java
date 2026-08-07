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
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw new UnhandledAudioFormatException(inputAudioFormat);
        }
        this.sampleRateHz = inputAudioFormat.sampleRate;
        this.channelCount = inputAudioFormat.channelCount;
        this.encoding = inputAudioFormat.encoding;

        // 通知均衡器采样率变化
        equalizer.setSampleRate(sampleRateHz);
        Log.d(TAG, "Configured: SR=" + sampleRateHz + " channels=" + channelCount);

        return inputAudioFormat;
    }

    @Override
    public boolean isActive() {
        // 均衡器关闭时返回 false，让 ExoPlayer 走标准无处理器的音频路径，
        // 避免关闭均衡器后仍强制走软件处理链（恒 active）导致播放卡顿。
        // 开关均衡器不会运行时重建播放管线（offload 始终禁用），
        // 仅在均衡器开启状态下本处理器才参与音频处理。
        return equalizer.isEnabled();
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int position = input.position();
        int limit = input.limit();
        int remaining = limit - position;
        if (remaining == 0) return;

        if (!equalizer.isEnabled()) {
            // 均衡器未启用时透传。不能直接返回 input 的切片视图：
            // 其底层存储会被 ExoPlayer 复用覆盖，必须拷贝到自有缓冲区。
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

        int frameSize = channelCount * 2; // 16-bit PCM = 2 bytes per sample
        int frameCount = remaining / frameSize;
        int totalSamples = frameCount * channelCount;

        // 确保处理缓冲区足够大
        if (processingBuffer == null || processingBufferCapacity < totalSamples) {
            processingBuffer = new short[totalSamples];
            processingBufferCapacity = totalSamples;
        }

        // 确保输出ByteBuffer足够大
        int outputSize = remaining;
        if (pendingOutputBuffer == null || pendingOutputBuffer.capacity() < outputSize) {
            pendingOutputBuffer = ByteBuffer.allocateDirect(outputSize).order(ByteOrder.LITTLE_ENDIAN);
        }
        pendingOutputBuffer.clear();

        // 从输入 ByteBuffer 读取 short 数据（保持原有字节序）
        ShortBuffer inputShortBuf = input.asShortBuffer();
        inputShortBuf.get(processingBuffer, 0, totalSamples);

        // 处理音频数据
        if (channelCount == 2) {
            equalizer.processStereo(processingBuffer, 0, frameCount);
        } else if (channelCount == 1) {
            equalizer.processMono(processingBuffer, 0, frameCount);
        } else {
            // 多声道情况：处理前两个声道，其余声道保持不变
            // 简化处理：对交织数据只处理每帧前两个采样
            equalizer.processStereo(processingBuffer, 0, frameCount);
        }

        // 将处理后的数据写入输出 ByteBuffer
        ShortBuffer outputShortBuf = pendingOutputBuffer.asShortBuffer();
        outputShortBuf.put(processingBuffer, 0, totalSamples);
        pendingOutputBuffer.position(0);
        pendingOutputBuffer.limit(outputSize);

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
