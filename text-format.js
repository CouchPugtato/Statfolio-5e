// A deliberately small Markdown subset: emphasis only, never HTML or links.
(() => {
  const escapeHTML = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character],
    );

  function runs(value, bold = false, italic = false, depth = 0) {
    const text = String(value ?? '');
    if (depth > 32) return [{ text, bold, italic }];
    const result = [];
    let plain = '';
    const flush = () => {
      if (plain) result.push({ text: plain, bold, italic });
      plain = '';
    };

    for (let index = 0; index < text.length;) {
      if (text[index] === '\\' && /[\\*]/.test(text[index + 1] || '')) {
        plain += text[index + 1];
        index += 2;
        continue;
      }
      if (text[index] !== '*') {
        plain += text[index++];
        continue;
      }
      const marker = text.slice(index).match(/^\*+/)[0];
      const start = index + marker.length;
      let closing = -1;
      if (
        marker.length <= 3 &&
        start < text.length &&
        !/\s/.test(text[start])
      ) {
        for (let cursor = start; cursor < text.length;) {
          if (text[cursor] === '\\') {
            cursor += 2;
            continue;
          }
          if (text[cursor] !== '*') {
            cursor++;
            continue;
          }
          const candidate = text.slice(cursor).match(/^\*+/)[0];
          if (candidate === marker && !/\s/.test(text[cursor - 1])) {
            closing = cursor;
            break;
          }
          cursor += candidate.length;
        }
      }
      if (closing < 0) {
        plain += marker;
        index = start;
        continue;
      }
      flush();
      result.push(
        ...runs(
          text.slice(start, closing),
          bold || marker.length >= 2,
          italic || marker.length !== 2,
          depth + 1,
        ),
      );
      index = closing + marker.length;
    }
    flush();
    return result;
  }

  window.StatfolioText = {
    plain: (text) =>
      runs(text)
        .map((run) => run.text)
        .join(''),
    html: (text, limit = Infinity) =>
      runs(text)
        .map((run) => {
          const fragment = run.text.slice(0, Math.max(0, limit));
          limit -= fragment.length;
          if (!fragment) return '';
          let content = escapeHTML(fragment);
          if (run.italic) content = `<em>${content}</em>`;
          if (run.bold) content = `<strong>${content}</strong>`;
          return content;
        })
        .join(''),
  };
})();
