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
    private int inputChannelCount = 2;
    private boolean downmix = false;
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
        this.inputChannelCount = inputAudioFormat.channelCount;
        this.encoding = inputAudioFormat.encoding;
        // 多声道（5.1/7.1 等多声道 PCM）下混为立体声再输出：
        // 多数手机的 AudioTrack 无法直接打开 4/6/8 声道 PCM，会触发
        // "AudioTrack init failed"（如 Config(...,4,...)）。这里统一下混到 2 声道，
        // 保证任何设备都能正常出声。真·全景声应走 offload 码流直通，不经过本处理器。
        this.channelCount = inputAudioFormat.channelCount > 2 ? 2 : inputAudioFormat.channelCount;
        this.downmix = inputAudioFormat.channelCount > 2;

        // 通知均衡器采样率变化
        equalizer.setSampleRate(sampleRateHz);
        Log.d(TAG, "Configured: SR=" + sampleRateHz + " inCh=" + inputChannelCount
                + " outCh=" + channelCount + " encoding=" + encoding + " downmix=" + downmix);

        if (channelCount == inputChannelCount) return inputAudioFormat;
        return new AudioFormat(sampleRateHz, channelCount, encoding);
    }

    @Override
    public boolean isActive() {
        // 恒返回 true：让均衡器处理器常驻音频链，AudioTrack 配置恒定，
        // 避免关闭均衡器时 isActive 翻转触发 media3 反复重建 AudioTrack
        // 导致一卡一卡。均衡器关闭时由 queueInput 内部透传（安全拷贝），
        // 不改变采样/声道，音质无损。
        // 注：Atmos / offload 模式下 media3 会直接绕过 AudioProcessor 链，
        // 本处理器天然不参与，等效"关闭均衡器"。
        return true;
    }

    @Override
    public void queueInput(ByteBuffer input) {
        int position = input.position();
        int limit = input.limit();
        int remaining = limit - position;
        if (remaining == 0) return;

        boolean isFloat = encoding == C.ENCODING_PCM_FLOAT;
        boolean is24Bit = encoding == C.ENCODING_PCM_24BIT;
        boolean is32Bit = encoding == C.ENCODING_PCM_32BIT;
        int bytesPerSample = isFloat || is32Bit ? 4 : (is24Bit ? 3 : 2);
        int inputFrameSize = inputChannelCount * bytesPerSample;
        int frameCount = remaining / inputFrameSize;
        int inputTotalSamples = frameCount * inputChannelCount;

        // 快速透传：均衡器关闭且无需下混时，直接拷贝原始字节
        if (!equalizer.isEnabled() && !downmix) {
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

        // 确保处理缓冲区足够大（按输入声道数解码）
        if (processingBuffer == null || processingBufferCapacity < inputTotalSamples) {
            processingBuffer = new short[inputTotalSamples];
            processingBufferCapacity = inputTotalSamples;
        }

        // 将输入数据解码为 16-bit short 数组（按 inputChannelCount 声道）
        if (isFloat) {
            for (int i = 0; i < inputTotalSamples; i++) {
                float f = input.getFloat(position + i * 4);
                float clamped = Math.max(-1f, Math.min(1f, f));
                processingBuffer[i] = (short)(clamped * 32767f);
            }
        } else if (is32Bit) {
            for (int i = 0; i < inputTotalSamples; i++) {
                int s = input.getInt(position + i * 4);
                processingBuffer[i] = (short)(s >> 16);
            }
        } else if (is24Bit) {
            for (int i = 0; i < inputTotalSamples; i++) {
                int off = position + i * 3;
                int s = (input.get(off) & 0xFF)
                      | ((input.get(off + 1) & 0xFF) << 8)
                      | ((input.get(off + 2) & 0xFF) << 16);
                if ((s & 0x800000) != 0) s |= 0xFF000000;
                processingBuffer[i] = (short)(s >> 8);
            }
        } else {
            ShortBuffer inputShortBuf = input.asShortBuffer();
            inputShortBuf.get(processingBuffer, 0, inputTotalSamples);
        }

        // 多声道下混为立体声（原地写入，输出比输入短，不会越界）
        if (downmix) {
            for (int f = 0; f < frameCount; f++) {
                int base = f * inputChannelCount;
                int sumL = 0, sumR = 0, cntL = 0, cntR = 0;
                for (int c = 0; c < inputChannelCount; c++) {
                    if (c % 2 == 0) { sumL += processingBuffer[base + c]; cntL++; }
                    else { sumR += processingBuffer[base + c]; cntR++; }
                }
                processingBuffer[f * 2] = cntL > 0 ? (short)(sumL / cntL) : 0;
                processingBuffer[f * 2 + 1] = cntR > 0 ? (short)(sumR / cntR) : 0;
            }
        }

        int outputTotalSamples = frameCount * channelCount;

        // 均衡处理（仅启用时）
        if (equalizer.isEnabled()) {
            if (channelCount == 2) {
                equalizer.processStereo(processingBuffer, 0, frameCount);
            } else {
                equalizer.processMono(processingBuffer, 0, frameCount);
            }
        }

        // 输出缓冲区大小：按输出声道数（channelCount，已下混为 2 或保持原值）
        int outputFrameSize = channelCount * bytesPerSample;
        int outputSize = frameCount * outputFrameSize;
        if (pendingOutputBuffer == null || pendingOutputBuffer.capacity() < outputSize) {
            pendingOutputBuffer = ByteBuffer.allocateDirect(outputSize).order(ByteOrder.LITTLE_ENDIAN);
        }
        pendingOutputBuffer.clear();

        // 将处理后的数据编码回原格式
        if (isFloat) {
            for (int i = 0; i < outputTotalSamples; i++) {
                float f = processingBuffer[i] / 32767f;
                pendingOutputBuffer.putFloat(f);
            }
        } else if (is32Bit) {
            for (int i = 0; i < outputTotalSamples; i++) {
                pendingOutputBuffer.putInt(processingBuffer[i] << 16);
            }
        } else if (is24Bit) {
            for (int i = 0; i < outputTotalSamples; i++) {
                int s = processingBuffer[i] << 8;
                pendingOutputBuffer.put((byte)(s & 0xFF));
                pendingOutputBuffer.put((byte)((s >> 8) & 0xFF));
                pendingOutputBuffer.put((byte)((s >> 16) & 0xFF));
            }
        } else {
            ShortBuffer outputShortBuf = pendingOutputBuffer.asShortBuffer();
            outputShortBuf.put(processingBuffer, 0, outputTotalSamples);
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
        inputChannelCount = 2;
        downmix = false;
        encoding = C.ENCODING_PCM_16BIT;
        processingBuffer = null;
        processingBufferCapacity = 0;
        pendingOutputBuffer = null;
    }
}
