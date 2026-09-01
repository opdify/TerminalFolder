declare module 'tree-kill' {
  type Callback = (error?: Error) => void;

  function kill(pid: number, signal?: string, callback?: Callback): void;

  export default kill;
}
