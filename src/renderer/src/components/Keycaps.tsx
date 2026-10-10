export function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="keycaps">
      {keys.map((key) => (
        <kbd key={key} className="keycap">
          {key}
        </kbd>
      ))}
    </span>
  );
}
