import { useEffect, useRef } from 'react';

class WaveformVisualiser {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.intensity  = options.intensity  ?? 0.54;
    this.layerCount = options.layers     ?? 28;
    this.spikeAmt   = options.spikes     ?? 1.0;
    this.idleSpeed  = options.idleSpeed  ?? 0.08;
    this.isPlaying  = false;
    this.isExpanded = false;

    this._compactParams  = { intensity: options.intensity ?? 0.54, layers: options.layers ?? 28, spikes: options.spikes ?? 1.0 };
    this._expandedParams = { intensity: 0.72, layers: 40, spikes: 1.0 };

    this._LOOP        = 24;
    this._SPEED_SCALE = 6.0;
    this._PHI         = 1.6180339887;
    this._startTime   = null;
    this._rafId       = null;
    this._spikes      = [];
    this._nextSpikeId = 0;
    this._lastSpawn   = 0;
    this._layers      = [];

    this._irrationals = this._buildIrrationals();
    this._buildLayers();
    this._bindResize();
    this._resize();
    this._start();
  }

  setPlaying(bool)  { this.isPlaying = bool; }
  setIntensity(v)   { this.intensity = Math.max(0, Math.min(1, v)); }
  setLayers(n)      { this.layerCount = Math.max(6, Math.min(40, Math.round(n))); this._buildLayers(); }
  setSpikes(v)      { this.spikeAmt = Math.max(0, Math.min(1, v)); }

  setExpanded(bool) {
    this.isExpanded = bool;
    const p = bool ? this._expandedParams : this._compactParams;
    this.intensity  = p.intensity;
    this.spikeAmt   = p.spikes;
    this.layerCount = p.layers;
    this._buildLayers();
    this._resize();
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resizeHandler);
  }

  _buildIrrationals() {
    const P = this._PHI;
    return [
      1, P, P*P, 1/P, Math.sqrt(2), Math.sqrt(3),
      Math.sqrt(5), P*Math.sqrt(2), 1.3, 0.7, 2.1, 0.43,
      1.72, P*0.6, Math.sqrt(7), 0.91, 1.18, P*1.3,
      0.61, 2.37, 1.05, P*P*0.5, Math.sqrt(11), 0.83,
      1.44, P*0.8, 2.0, Math.sqrt(6), 0.55, 1.9,
      P*1.1, Math.sqrt(13), 0.72, 1.62, P*0.4, 2.5,
      Math.sqrt(17), 0.38, 1.25, P*2.1,
    ];
  }

  _buildLayers() {
    this._layers = [];
    const total = this.layerCount;
    for (let i = 0; i < total; i++) {
      const frac       = i / Math.max(total - 1, 1);
      const speedBoost = 1.0 + frac * 0.7;
      this._layers.push({
        speedMult:   this._irrationals[i % this._irrationals.length] * this._SPEED_SCALE * speedBoost,
        freqMult:    1 + frac * 2.5,
        phaseOffset: frac * Math.PI * 4.3,
        ampScale:    0.6 + 0.4 * Math.sin(frac * Math.PI),
        harmonic:    i % 3 === 0 ? 2 : (i % 5 === 0 ? 3 : 1),
        frac,
      });
    }
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = r.width  * dpr;
    this.canvas.height = r.height * dpr;
    this._dpr = dpr;
  }

  _bindResize() {
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _seedSpike(now) {
    return {
      id:        this._nextSpikeId++,
      xNorm:     0.05 + Math.random() * 0.90,
      layerFrac: 0.3  + Math.random() * 0.70,
      born:      now,
      duration:  0.18 + Math.random() * 0.32,
      height:    0.6  + Math.random() * 1.4,
      sign:      Math.random() > 0.5 ? 1 : -1,
      width:     0.012 + Math.random() * 0.035,
    };
  }

  _gauss(x, center, sigma) {
    const d = (x - center) / sigma;
    return Math.exp(-0.5 * d * d);
  }

  _start() {
    const tick = (ts) => { this._rafId = requestAnimationFrame(tick); this._draw(ts); };
    this._rafId = requestAnimationFrame(tick);
  }

  _draw(ts) {
    if (!this._startTime) this._startTime = ts;
    const totalSec = (ts - this._startTime) / 1000;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const dpr = this._dpr;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, W, H);

    const speedMod = this.isPlaying ? 1.0 : this.idleSpeed;
    const spikeAmt = this.isPlaying ? this.spikeAmt : 0;
    const amp      = this.intensity;
    const count    = this._layers.length;
    const midY     = H * 0.5;
    const waveH    = H * 0.38 * amp;
    const steps    = Math.min(300, W);
    const BASE_W   = (2 * Math.PI) / this._LOOP;

    const MAX_SPIKES    = 80;
    const spawnInterval = 0.03 + (1 - spikeAmt) * 0.175;
    if (spikeAmt > 0.01 && totalSec - this._lastSpawn > spawnInterval) {
      const roll  = Math.random();
      const burst = roll < 0.30 ? 4 : roll < 0.60 ? 3 : roll < 0.85 ? 2 : 1;
      for (let b = 0; b < burst; b++) {
        if (this._spikes.length < MAX_SPIKES) this._spikes.push(this._seedSpike(totalSec));
      }
      this._lastSpawn = totalSec;
    }
    this._spikes = this._spikes.filter(sp => totalSec - sp.born < sp.duration);

    for (let li = 0; li < count; li++) {
      const lyr  = this._layers[li];
      const frac = lyr.frac;

      const spread = H * 0.22 * (1 - frac);
      const layerY = midY - spread * 0.5 + frac * spread * 0.2;
      const bright = 0.08 + 0.92 * Math.pow(frac, 1.4);

      const r     = Math.round(180 + bright * 75);
      const g     = Math.round(80  + bright * 90);
      const b     = 0;
      const alpha = 0.12 + bright * 0.88;
      const phase = totalSec * BASE_W * lyr.speedMult * speedMod;

      const layerSpikes = this._spikes.filter(sp => Math.abs(sp.layerFrac - frac) < 0.25);

      const waveSample = (xNorm) => {
        const a  = Math.sin(xNorm * Math.PI * 2 * lyr.freqMult + phase + lyr.phaseOffset);
        const b2 = Math.sin(xNorm * Math.PI * 2 * lyr.freqMult * lyr.harmonic + phase * 1.3 + lyr.phaseOffset * 0.7) * 0.28;
        let base = (a + b2) * lyr.ampScale;
        for (const sp of layerSpikes) {
          const age       = (totalSec - sp.born) / sp.duration;
          const env       = age < 0.15 ? age / 0.15 : 1 - Math.pow((age - 0.15) / 0.85, 0.6);
          const layerDist = Math.abs(sp.layerFrac - frac) / 0.25;
          const layerFade = 1 - layerDist * layerDist;
          const shape     = this._gauss(xNorm, sp.xNorm, sp.width);
          base += sp.sign * sp.height * env * layerFade * shape * spikeAmt;
        }
        return base;
      };

      ctx.beginPath();
      ctx.lineWidth   = (0.6 + bright * 1.1) * dpr;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      for (let i = 0; i <= steps; i++) {
        const xn = i / steps;
        const px = xn * W;
        const py = layerY + waveSample(xn) * waveH;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();

      if (frac > 0.4) {
        ctx.beginPath();
        ctx.lineWidth   = (2 + bright * 4) * dpr;
        ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.09).toFixed(3)})`;
        for (let i = 0; i <= steps; i++) {
          const xn = i / steps;
          const px = xn * W;
          const py = layerY + waveSample(xn) * waveH;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.setLineDash([3 * dpr, 6 * dpr]);
    ctx.lineWidth   = 0.5 * dpr;
    ctx.strokeStyle = 'rgba(180,100,0,0.18)';
    ctx.moveTo(0, midY);
    ctx.lineTo(W, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export default function WaveformGraphic({ isPlaying, expanded = false }) {
  const canvasRef = useRef(null);
  const visRef    = useRef(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    visRef.current = new WaveformVisualiser(cv, {
      intensity: 0.54,
      layers:    28,
      spikes:    1.0,
      idleSpeed: 0.08,
    });
    return () => { visRef.current?.destroy(); visRef.current = null; };
  }, []);

  useEffect(() => { visRef.current?.setPlaying(isPlaying); }, [isPlaying]);
  useEffect(() => { visRef.current?.setExpanded(expanded); }, [expanded]);

  const height = expanded ? 200 : 80;

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: `${height}px` }}
    />
  );
}
