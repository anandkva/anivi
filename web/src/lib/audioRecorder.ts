/**
 * Helper to record voice messages with live waveform analysis.
 */

export interface RecordingResult {
  blob: Blob;
  dataUrl: string;
  duration: number;
  waveform: number[];
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private waveformSamples: number[] = [];

  public async start(onWaveformSample?: (level: number) => void): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.waveformSamples = [];
      this.startTime = Date.now();

      // Audio analysis for waveform
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const sampleInterval = 100; // sample every 100ms
      let lastSample = Date.now();

      const sampleLoop = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(1, Math.max(0.1, avg / 128));

        const now = Date.now();
        if (now - lastSample >= sampleInterval) {
          this.waveformSamples.push(normalized);
          lastSample = now;
        }

        if (onWaveformSample) {
          onWaveformSample(normalized);
        }

        this.animationFrameId = requestAnimationFrame(sampleLoop);
      };

      this.animationFrameId = requestAnimationFrame(sampleLoop);

      // MediaRecorder setup
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? { mimeType: 'audio/mp4' }
        : undefined;

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      return true;
    } catch (err) {
      console.error('Error starting audio recording:', err);
      return false;
    }
  }

  public async stop(): Promise<RecordingResult | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const duration = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

        // Resample waveform into ~30 fixed bars for clean UI
        const finalWaveform = this.resampleWaveform(this.waveformSamples, 30);

        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          this.cleanup();
          resolve({
            blob,
            dataUrl,
            duration,
            waveform: finalWaveform,
          });
        };
        reader.readAsDataURL(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  public cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private resampleWaveform(samples: number[], targetCount: number): number[] {
    if (samples.length === 0) {
      return Array(targetCount).fill(0.3);
    }
    if (samples.length <= targetCount) {
      const result: number[] = [];
      const step = samples.length / targetCount;
      for (let i = 0; i < targetCount; i++) {
        const index = Math.min(samples.length - 1, Math.floor(i * step));
        result.push(samples[index]);
      }
      return result;
    }
    const result: number[] = [];
    const blockSize = samples.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * blockSize);
      const end = Math.floor((i + 1) * blockSize);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < samples.length; j++) {
        sum += samples[j];
        count++;
      }
      result.push(count > 0 ? sum / count : 0.3);
    }
    return result;
  }
}
