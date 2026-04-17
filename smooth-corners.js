class SmoothCorners {
  static get inputProperties() {
    return ['--smooth-corners'];
  }

  paint(ctx, size, props) {
    const n = parseFloat(props.get('--smooth-corners')) || 4;
    const w = size.width;
    const h = size.height;
    const m = Math.min(w, h) / 2;

    ctx.fillStyle = '#000';
    ctx.beginPath();
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      const x = w / 2 + Math.sign(cosT) * (w / 2) * Math.pow(Math.abs(cosT), 2 / n);
      const y = h / 2 + Math.sign(sinT) * (h / 2) * Math.pow(Math.abs(sinT), 2 / n);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

registerPaint('smooth-corners', SmoothCorners);
