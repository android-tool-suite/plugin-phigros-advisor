(() => {
  const dateLabel = time => new Date(time).toLocaleDateString(undefined, {month:'numeric', day:'numeric'});
  const detailDate = time => new Date(time).toLocaleString();
  window.phigrosTrend = {
    mount(root, {events, days = 30, onRangeChange}) {
      root.innerHTML = '<div class="section-header"><h3>RKS 变化</h3></div><div class="trend-ranges" aria-label="RKS 历史时间范围"></div><div class="trend-plot"></div><div class="trend-detail"><span></span><strong></strong></div><small class="supporting">本地同步历史 · 点按查看历史节点</small>';
      const ranges = root.querySelector('.trend-ranges'), plot = root.querySelector('.trend-plot');
      const detail = root.querySelector('.trend-detail');
      let range = days, model, geometry, selected = 0;
      for (const value of [7, 30, 90, 0]) {
        const button = document.createElement('button');button.type = 'button';button.className = 'secondary trend-range';
        button.textContent = value ? `${value} 天` : '全部';button.dataset.days = String(value);
        button.onclick = () => {range = value;selected = Infinity;onRangeChange(value);draw();};ranges.append(button);
      }
      function select(index) {
        if (!model?.points.length || !geometry) return;
        selected = Math.max(0, Math.min(model.points.length - 1, index));
        const point = model.points[selected], x = geometry.x[selected], y = geometry.y[selected];
        const marker = plot.querySelector('.trend-selected'), guide = plot.querySelector('.trend-guide');
        marker.setAttribute('cx', x);marker.setAttribute('cy', y);guide.setAttribute('x1', x);guide.setAttribute('x2', x);
        detail.querySelector('span').textContent = detailDate(point.time);
        detail.querySelector('strong').textContent = `${point.value.toFixed(4)} RKS`;
        plot.querySelector('button').setAttribute('aria-label', `${detailDate(point.time)}，RKS ${point.value.toFixed(4)}。左右方向键查看相邻历史节点。`);
      }
      function draw() {
        if (!root.isConnected) return;
        const width = plot.clientWidth;if (!width) return;
        const focused = plot.contains(document.activeElement);
        model = phigrosPresentation.rksTrend(events, range);
        ranges.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.days) === range)));
        if (!model.points.length) {
          plot.innerHTML = '<div class="empty trend-empty">此时间范围内没有历史记录。同步云存档后积累变化记录。</div>';
          detail.hidden = true;geometry = null;return;
        }
        detail.hidden = false;selected = Math.min(selected, model.points.length - 1);
        const height = 198, left = 64, right = 12, top = 24, bottom = 166;
        const values = model.points.map(point => point.value), min = Math.min(...values), max = Math.max(...values);
        const padding = Math.max((max - min) * .1, .005);
        const low = Math.max(0, Math.floor((min - padding) * 100) / 100), high = Math.ceil((max + padding) * 100) / 100;
        // A single all-time point still gets a one-day axis, without inventing prior samples.
        const start = model.end > model.start ? model.start : model.start - 86400000, span = Math.max(1, model.end - start);
        const x = model.points.map(point => left + (point.time - start) / span * (width - left - right));
        const y = model.points.map(point => bottom - (point.value - low) / (high - low) * (bottom - top));
        geometry = {x, y};
        const grid = Array.from({length:4}, (_, i) => {
          const py = bottom - (bottom - top) * i / 3, value = low + (high - low) * i / 3;
          return `<line class="trend-grid" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text x="${left-10}" y="${py+4}" text-anchor="end">${value.toFixed(2)}</text>`;
        }).join('');
        const dates = [0, .5, 1].map((fraction, i) => `<text x="${left+(width-left-right)*fraction}" y="191" text-anchor="${i===0?'start':i===2?'end':'middle'}">${dateLabel(start+span*fraction)}</text>`).join('');
        const path = x.map((px, i) => `${i?'L':'M'}${px.toFixed(2)},${y[i].toFixed(2)}`).join(' ');
        plot.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${range?'近 '+range+' 天':'全部历史'} RKS 变化，${model.points.length} 个历史节点"><text x="0" y="13">RKS</text><text x="${width-right}" y="13" text-anchor="end">日期</text>${grid}${dates}<path class="trend-line" d="${path}"/>${x.map((px,i)=>`<circle class="trend-dot" cx="${px}" cy="${y[i]}" r="2.5"/>`).join('')}<line class="trend-guide" y1="${top}" y2="${bottom}"/><circle class="trend-selected" r="5"/></svg><button type="button" class="trend-hit" aria-label="查看 RKS 历史节点"></button>`;
        select(selected);if (focused) plot.querySelector('button').focus({preventScroll:true});
      }
      function pick(event) {
        if (!geometry) return;
        const bounds = plot.getBoundingClientRect(), x = (event.clientX - bounds.left) * plot.clientWidth / bounds.width;
        let closest = 0;geometry.x.forEach((value, index) => {if (Math.abs(value-x) < Math.abs(geometry.x[closest]-x)) closest = index;});select(closest);
      }
      plot.addEventListener('pointermove', event => {if (event.pointerType !== 'touch' && event.target.closest('.trend-hit')) pick(event);});
      plot.addEventListener('click', event => {if (event.detail && event.target.closest('.trend-hit')) pick(event);});
      plot.addEventListener('keydown', event => {
        if (!event.target.closest('.trend-hit')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault();event.stopPropagation();select(selected + (event.key === 'ArrowRight' ? 1 : -1));}
        if (event.key === 'Home' || event.key === 'End') {event.preventDefault();select(event.key === 'Home' ? 0 : model.points.length - 1);}
      });
      selected = Infinity;
      const observer = new ResizeObserver(draw);observer.observe(plot);draw();
      return {dispose:() => observer.disconnect()};
    }
  };
})();
