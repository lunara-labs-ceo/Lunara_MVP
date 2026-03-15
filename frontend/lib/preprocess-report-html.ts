/**
 * Preprocess report HTML for Tiptap compatibility.
 *
 * Tiptap's schema only understands standard nodes (p, h1-h6, img, ul, ol, etc.).
 * We need to convert:
 * - <figure>/<figcaption> → <img> + <p> (no Figure node in open-source Tiptap)
 * - <section> → unwrap contents (Tiptap doesn't have a Section node)
 * - <div class="lunara-report"> → unwrap contents
 */
export function preprocessReportHtml(html: string): string {
  if (!html) return html;

  let result = html;

  // 1. Convert <figure> blocks: extract <img> and <figcaption> separately.
  //    Use greedy match (.*) since base64 strings can be huge and non-greedy
  //    [\s\S]*? can cause issues with large content.
  result = result.replace(
    /<figure[^>]*>([\s\S]*?)<\/figure>/gi,
    (_match, inner: string) => {
      // Extract the <img> tag (match up to the closing > or />)
      const imgMatch = inner.match(/<img\s[^>]*>/i);
      const img = imgMatch ? imgMatch[0] : "";

      // Extract figcaption text
      const captionMatch = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
      const caption = captionMatch ? captionMatch[1].trim() : "";

      const parts: string[] = [];
      if (img) parts.push(img);
      if (caption) {
        parts.push(
          `<p style="text-align: center; font-size: 14px; color: #666; margin-top: 8px;"><em>${caption}</em></p>`
        );
      }
      return parts.join("\n");
    }
  );

  // 2. Unwrap <section> tags — keep inner content, remove the wrapper
  result = result.replace(/<\/?section[^>]*>/gi, "");

  // 3. Unwrap <div class="lunara-report"> wrapper
  result = result.replace(/<div[^>]*class="[^"]*lunara-report[^"]*"[^>]*>/gi, "");
  // Remove the corresponding closing </div> — just strip all bare </div> at root
  // (This is safe because Tiptap doesn't use <div> nodes)
  result = result.replace(/<\/div>/gi, "");

  return result;
}
