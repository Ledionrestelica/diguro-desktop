/** The inline `#File name` pill, used in the composer and the user bubble.
 *  It must not change text metrics: the composer draws it under a
 *  transparent textarea, so padding is faked with a same-colour shadow. */
export function MentionText({ text, token }: { text: string; token: string | null }) {
  const start = token ? text.indexOf(token) : -1;
  if (!token || start < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <span
        title="The assistant answers from this file only"
        className="rounded-[4px] bg-blue-3 text-blue-11 shadow-[0_0_0_2px_var(--color-blue-3)]"
      >
        {token}
      </span>
      {text.slice(start + token.length)}
    </>
  );
}
