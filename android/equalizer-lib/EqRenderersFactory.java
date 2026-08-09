package cn.toside.music.mobile.equalizer;

import android.content.Context;

import androidx.annotation.Nullable;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;

/**
 * 自定义 RenderersFactory，注入均衡器 AudioProcessor
 */
@UnstableApi
public class EqRenderersFactory extends DefaultRenderersFactory {
    private static EqualizerAudioProcessor eqAudioProcessor;

    public static EqualizerAudioProcessor getEqualizerAudioProcessor() {
        if (eqAudioProcessor == null) {
            eqAudioProcessor = new EqualizerAudioProcessor();
        }
        return eqAudioProcessor;
    }

    public EqRenderersFactory(Context context) {
        super(context);
    }

    @Override
    @Nullable
    protected AudioSink buildAudioSink(
            Context context,
            boolean enableFloatOutput,
            boolean enableAudioTrackPlaybackParams) {

        // 构建音频处理器列表 - 将均衡器放在第一个位置
        AudioProcessor[] processors = new AudioProcessor[] {
            getEqualizerAudioProcessor()
        };

        return new DefaultAudioSink.Builder(context)
                .setAudioProcessors(processors)
                .setEnableFloatOutput(enableFloatOutput)
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                .setAudioTrackBufferSizeProvider(
                    (minBufferSizeInBytes,
                     encoding,
                     outputMode,
                     pcmFrameSize,
                     sampleRate,
                     bitrate,
                     maxAudioTrackPlaybackSpeed) -> {
                        if (outputMode == DefaultAudioSink.OUTPUT_MODE_PCM) {
                            // media3 默认 PCM 缓冲上限仅 750ms，音频写入节奏抖动时
                            // 容易触发 AudioTrack underrun 导致偶发"顿一下"。
                            // 提升到 1.5s 缓冲吸收写入抖动，减少欠载卡顿。
                            long targetUs = 1_500_000L;
                            long bufferSize = (long) sampleRate * pcmFrameSize
                                    * targetUs / 1_000_000L;
                            long result = Math.max(minBufferSizeInBytes, bufferSize);
                            if (result > Integer.MAX_VALUE) {
                                return Integer.MAX_VALUE;
                            }
                            return (int) result;
                        }
                        return minBufferSizeInBytes;
                    })
                .build();
    }
}
