class CommandError extends Error {
  exitCode;
  needsHuman;
  constructor(exitCode, message, needsHuman) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
    this.needsHuman = needsHuman;
  }
}
export {
  CommandError
};
