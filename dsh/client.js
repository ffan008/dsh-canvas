window.__ModuleLoader__.load({
  id: '@local/dsh-canvas',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const STATION_COLORS = [
      { bar: '#6d4aff', soft: '#efeaff' },
      { bar: '#2563b0', soft: '#e6effb' },
      { bar: '#1f7a52', soft: '#e8f5ee' },
      { bar: '#b8791a', soft: '#fbf0dc' },
      { bar: '#a63d6b', soft: '#fbe9f1' },
      { bar: '#3f7d6e', soft: '#e6f2ef' },
    ];

    // Card grammar, one line per element:
    //   标题 | 说明                  -> card heading
    //   触发 | 每天 08:30 自动运行     -> trigger strip
    //   1 名称 | 输入 → 输出 | 动作    -> expandable station
    //   交付 | 文本                    -> green final-delivery strip
    //   降级 | 文本                    -> dashed amber fallback strip
    //   编号 | AUTOMATION-ID           -> footer id
    function parseFlow(code) {
      const head = { title: '内容生产线', note: '', trigger: '', delivery: '', fallback: '', ref: '' };
      const stations = [];
      for (const raw of String(code || '').split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split('|').map(part => part.trim());
        const label = parts[0] || '';
        const body = parts.slice(1);
        if (/^(触发|trigger)$/i.test(label)) { head.trigger = body.join(' | '); continue; }
        if (/^(交付|最终交付|delivery)$/i.test(label)) { head.delivery = body.join(' | '); continue; }
        if (/^(降级|降级路径|fallback)$/i.test(label)) { head.fallback = body.join(' | '); continue; }
        if (/^(编号|id)$/i.test(label)) { head.ref = body.join(' | '); continue; }
        const numbered = /^\s*(\d+)[\s.、)）]*(.*)$/.exec(label);
        if (numbered && numbered[2].trim()) {
          const [io, action] = [body[0] || '', body[1] || ''];
          const [input, output] = io.split('→').map(part => (part || '').trim());
          stations.push({
            no: numbered[1], name: numbered[2].trim(),
            input, output, action,
          });
          continue;
        }
        if (!stations.length) {
          head.title = label || head.title;
          head.note = body.join(' | ');
        }
      }
      return { ...head, stations };
    }

    function Row({ k, v, tone }) {
      return h('div', { style: {
        display: 'flex', gap: 9, padding: '7px 0', fontSize: 11.5, lineHeight: 1.65,
        borderTop: '1px solid var(--dsw-alias-border-l2)',
      } },
      h('span', { style: { flex: '0 0 32px', color: tone, fontWeight: 700 } }, k),
      h('span', { style: { minWidth: 0, color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' } }, v));
    }

    function StationCard({ station, tone, accent, muted, index }) {
      const [open, setOpen] = React.useState(false);
      const [born, setBorn] = React.useState(index === 0);
      React.useEffect(() => {
        if (born) return;
        // Stagger by ordinal so a freshly streamed station pops in instead of blinking.
        const timer = window.setTimeout(() => setBorn(true), Math.min(index, 8) * 70);
        return () => window.clearTimeout(timer);
      }, [born, index]);
      const details = [
        station.input ? { k: '输入', v: station.input } : null,
        station.output ? { k: '输出', v: station.output } : null,
        station.action ? { k: '动作', v: station.action } : null,
      ].filter(Boolean);
      return h('div', { style: {
        minWidth: 0, borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${open ? tone.bar : 'var(--dsw-alias-border-l2)'}`,
        background: 'var(--dsw-alias-bg-base)',
        boxShadow: open ? '0 10px 24px rgba(0,0,0,.10)' : 'none',
        opacity: born ? 1 : 0,
        transform: born ? 'none' : 'translateY(6px) scale(.97)',
        transition: 'border-color .16s, box-shadow .16s, opacity .28s ease, transform .28s ease',
      } },
      h('div', { style: { height: 4, background: tone.bar } }),
      h('button', { type: 'button', 'aria-expanded': open,
        onClick: () => setOpen(value => !value),
        style: {
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '13px 13px 12px', border: 0, background: 'transparent',
          color: 'inherit', font: 'inherit',
        } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 } },
        h('span', { style: {
          display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7,
          background: tone.soft, color: tone.bar, fontSize: 11.5, fontWeight: 800,
        } }, station.no),
        h('span', { style: { fontSize: 13.5, fontWeight: 800, color: accent, overflowWrap: 'anywhere' } }, station.name)),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: tone.bar, fontWeight: 700 } },
        h('span', null, open ? '收起细节' : '点开看细节'),
        h('span', { style: {
          display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .16s', fontSize: 10,
        } }, '›'))),
      open ? h('div', { style: { padding: '2px 13px 13px' } },
        details.map(item => h(Row, { key: item.k, k: item.k, v: item.v, tone: muted }))) : null);
    }

    // Free-form HTML card. Scripts run only inside a sandboxed iframe with an opaque
    // origin, so a fence can bring its own CSS and click handlers without reaching the
    // conversation, the host page or this machine's storage.
    function HtmlFenceLayer({ code, streaming, fallback, svg }) {
      const [showSource, setShowSource] = React.useState(false);
      const [height, setHeight] = React.useState(svg ? 300 : 160);
      const [warn, setWarn] = React.useState('');
      const frame = React.useRef(null);
      const shell = React.useRef(null);
      const html = String(code || '').trim();

      // The sandboxed document reports its own height: same-origin reads are blocked by
      // design, so measuring from outside would silently keep the frame at its first size.
      const srcDoc = React.useMemo(() => {
        const theme = svg
          ? 'html,body{margin:0;padding:12px 14px;background:transparent;'
            + 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}'
            + '*{box-sizing:border-box}svg{display:block;width:100%;height:auto}'
          : 'html,body{margin:0;padding:0;background:transparent;color-scheme:light dark;'
            + 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;'
            + 'color:#1c1917;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}'
            + '*{box-sizing:border-box}'+ ':where(body>div,body>section,[data-allwise-root]>div,[data-allwise-root]>section){padding:16px 18px}'
            + '.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
        // Height must come from a wrapping element, not scrollHeight: an iframe stretched
        // to the last reported size makes the document at least that tall, so a collapse
        // would never report a smaller value.
        const reporter = '<scr' + 'ipt>(function(){'
          + 'var root=document.createElement("div");root.setAttribute("data-allwise-root","");'
          + 'while(document.body.firstChild){root.appendChild(document.body.firstChild);}'
          + 'document.body.appendChild(root);'
          + 'var last=0;'
          + 'function send(){'
          + 'var h=Math.ceil(root.getBoundingClientRect().height);'
          + 'if(h>0&&h!==last){last=h;parent.postMessage({__allwiseHeight:h},"*");}'
          + '}'
          + 'window.addEventListener("load",send);'
          + 'if(window.ResizeObserver){new ResizeObserver(send).observe(root);}'
          + 'document.addEventListener("click",function(){setTimeout(send,50);},true);'
          + 'document.addEventListener("transitionend",function(){setTimeout(send,50);},true);'
          + 'setInterval(send,300);setTimeout(send,0);'
          + '})();</scr' + 'ipt>';
        return '<!doctype html><html><head><meta charset="utf-8">'
          + '<meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<style>' + theme + '</style></head><body>' + html + reporter + '</body></html>';
      }, [html, svg]);

      React.useEffect(() => {
        const onMessage = (event) => {
          if (frame.current && event.source !== frame.current.contentWindow) return;
          const next = event.data && event.data.__allwiseHeight;
          if (typeof next === 'number' && next > 20 && Number.isFinite(next)) {
            setHeight(Math.min(Math.max(Math.ceil(next) + 2, 80), 2600));
            setWarn('');
          }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, []);

      // A fixed-width layout inside a narrow column is the other way content gets clipped:
      // scale it down instead of hiding the right half.
      React.useEffect(() => {
        if (!shell.current) return undefined;
        const fit = () => {
          const node = shell.current;
          if (!node) return;
          if (node.scrollWidth > node.clientWidth + 2) {
            setWarn('内容比窗口宽，已按比例缩小显示');
          }
        };
        const timer = window.setTimeout(fit, 700);
        return () => window.clearTimeout(timer);
      }, [srcDoc]);

      if (!html) {
        if (!streaming) return fallback || null;
        return h('div', {
          style: { margin: '14px 0', fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)' },
        }, '正在绘制…');
      }

      const small = {
        padding: '3px 9px', borderRadius: 7, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary)', font: 'inherit', fontSize: 11,
        lineHeight: 1.5,
      };

      const source = h('pre', {
        style: {
          marginTop: 8, padding: '11px 13px', borderRadius: 10, overflowX: 'auto',
          border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, lineHeight: 1.7,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre',
        },
      }, html);

      const boxes = [
        h('button', {
          key: 'code', type: 'button', style: small,
          onClick: () => setShowSource(value => !value),
        }, showSource ? '隐藏代码' : '查看代码'),
        h('button', {
          key: 'copy', type: 'button', style: small,
          onClick: () => { navigator.clipboard?.writeText(html).catch(() => {}); },
        }, '复制'),
        h('button', {
          key: 'full', type: 'button', style: small,
          onClick: () => {
            const node = frame.current;
            if (node && node.requestFullscreen) node.requestFullscreen().catch(() => {});
          },
        }, '全屏'),
      ];

      const frameBox = h('div', {
        ref: shell,
        style: {
          borderRadius: 14, overflow: 'hidden',
          border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)',
        },
      }, h('iframe', {
        ref: frame, title: '交互卡片', srcDoc, scrolling: 'no',
        sandbox: 'allow-scripts allow-popups allow-forms allow-modals',
        style: {
          display: 'block', width: '100%', height,
          border: 0, background: 'transparent',
          transition: 'height .12s ease',
        },
      }));

      return h('div', { style: { margin: '14px 0' } },
        frameBox,
        h('div', {
          style: { display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', marginTop: 6 },
        }, warn ? h('span', {
          style: { marginRight: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
        }, warn) : null, ...boxes),
        showSource ? source : null);
    }

    // The rendered card keeps its source reachable: inspect and copy the exact fence text.
    function SourceToggle({ code }) {
      const [show, setShow] = React.useState(false);
      const [copied, setCopied] = React.useState(false);
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      };
      const button = (label, onClick) => h('button', { type: 'button', onClick, style: {
        padding: '3px 9px', borderRadius: 7, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent', color: 'var(--dsw-alias-label-tertiary)',
        fontSize: 11, font: 'inherit', lineHeight: 1.5,
      } }, label);
      return h('div', null,
        h('div', { style: { display: 'flex', gap: 6 } },
          button(show ? '隐藏代码' : '查看代码', () => setShow(value => !value)),
          button(copied ? '已复制' : '复制', copy)),
        show ? h('pre', { style: {
          marginTop: 10, padding: '11px 13px', borderRadius: 10, overflowX: 'auto',
          border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)',
          color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, lineHeight: 1.7,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre',
        } }, code) : null);
    }

    function FlowFenceLayer({ lang, code, streaming, fallback }) {
      const flow = React.useMemo(() => parseFlow(code), [code]);
      // While the model is still writing this fence, keep an explicit progress row so the
      // card visibly grows instead of appearing complete all at once.
      if (!flow.stations.length) {
        return streaming
          ? h('div', { style: {
            margin: '14px 0', padding: '16px 18px', borderRadius: 14,
            border: '1px dashed var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)',
            fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)',
          } }, '正在铺开生产线…')
          : fallback || null;
      }
      const accent = 'var(--dsw-alias-label-primary)';
      const muted = 'var(--dsw-alias-label-tertiary)';
      const ok = '#1f7a52';
      const warn = '#9a6512';
      return h('section', { 'aria-label': flow.title, style: {
        margin: '14px 0', padding: '18px 18px 16px',
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 14,
        background: 'var(--dsw-alias-bg-layer-1)',
      } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 } },
        h('div', { style: { fontSize: 11.5, letterSpacing: '.04em', color: muted } }, '全智自媒体工作台'),
        h(SourceToggle, { code })),
      h('h3', { style: { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: accent } }, flow.title),
      flow.note ? h('p', { style: { margin: '0 0 14px', fontSize: 12.5, color: muted } }, flow.note) : h('div', { style: { height: 10 } }),

      flow.trigger ? h('div', { style: {
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '11px 14px', marginBottom: 14, borderRadius: 11,
        border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)',
      } },
      h('span', { style: {
        padding: '3px 9px', borderRadius: 99, background: accent, color: 'var(--dsw-alias-bg-base)',
        fontSize: 11, fontWeight: 700,
      } }, '触发'),
      h('span', { style: { fontSize: 12.5, color: accent, fontWeight: 600 } }, flow.trigger)) : null,

      h('div', { style: {
        display: 'grid', gap: 9,
        gridTemplateColumns: `repeat(${Math.min(flow.stations.length, 6)}, minmax(0, 1fr))`,
      } }, flow.stations.map((station, index) => h(StationCard, {
        key: station.no + station.name, station, accent, muted, index,
        tone: STATION_COLORS[index % STATION_COLORS.length],
      }))),

      flow.delivery ? h('div', { style: {
        display: 'flex', gap: 10, marginTop: 14, padding: '12px 14px',
        border: `1px solid ${ok}55`, borderRadius: 11, background: '#e8f5ee',
      } },
      h('div', null,
        h('div', { style: { color: ok, fontSize: 12.5, fontWeight: 800, marginBottom: 2 } }, '最终交付'),
        h('div', { style: { color: '#2c5e46', fontSize: 12, lineHeight: 1.65 } }, flow.delivery))) : null,

      flow.fallback ? h('div', { style: {
        display: 'flex', gap: 10, marginTop: 9, padding: '12px 14px',
        border: `1px dashed ${warn}66`, borderRadius: 11, background: '#fdf4e3',
      } },
      h('div', null,
        h('div', { style: { color: warn, fontSize: 12.5, fontWeight: 800, marginBottom: 2 } }, '降级路径'),
        h('div', { style: { color: '#6f4d12', fontSize: 12, lineHeight: 1.65 } }, flow.fallback))) : null,

      h('div', { style: {
        display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 13, paddingTop: 10,
        borderTop: '1px solid var(--dsw-alias-border-l2)', fontSize: 11, color: muted,
      } },
      h('span', null, flow.ref || '全智 AI · 自媒体工作台'),
      h('span', null, streaming
        ? `正在铺开 · 已有 ${flow.stations.length} 个工位`
        : `${flow.stations.length} 个工位 · 一条链路`)));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Structured pipeline: one line per station, rendered as expandable cards.
        ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
          name: 'conversation.chat.markdown.fence', id: 'dsh-canvas', key: 'allwise-flow', order: 0,
        }, function FlowFence({ children, ...rest }) {
          return h(FlowFenceLayer, { ...rest, fallback: children });
        }));
        // Raw SVG: draws as the model streams it in.
        ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
          name: 'conversation.chat.markdown.fence', id: 'dsh-canvas', key: 'allwise-svg', order: 0,
        }, function SvgFence({ children, ...rest }) {
          return h(HtmlFenceLayer, { ...rest, fallback: children, svg: true });
        }));
        // Free-form HTML: sandboxed, so a card may bring its own CSS and handlers.
        ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register({
          name: 'conversation.chat.markdown.fence', id: 'dsh-canvas', key: 'allwise-html', order: 0,
        }, function HtmlFence({ children, ...rest }) {
          return h(HtmlFenceLayer, { ...rest, fallback: children });
        }));
      },
    };
  },
});
