export function validatePreset(
  id: string,
  presets: readonly {id: string}[],
  kind: string,
) {
  if (!presets.some((preset) => preset.id === id)) {
    throw new RangeError(`Unknown ${kind} preset: ${String(id)}`);
  }
  return id;
}
