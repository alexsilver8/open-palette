/** Renders `text` with the characters at `positions` emphasised. */
export function Highlight({ text, positions }: { text: string; positions?: number[] }) {
  if (!positions || positions.length === 0) return <>{text}</>;
  const marked = new Set(positions);
  const parts: Array<{ text: string; marked: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const isMarked = marked.has(i);
    const last = parts[parts.length - 1];
    if (last && last.marked === isMarked) last.text += text[i];
    else parts.push({ text: text[i] as string, marked: isMarked });
  }
  return (
    <>
      {parts.map((part, index) =>
        part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}
