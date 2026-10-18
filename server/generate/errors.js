// An error with two messages: `message` is technical and goes to the
// server log; `childMessage` is shown in the app, so it must make sense to
// a child and never leak keys, URLs or stack traces.
export class GenerationError extends Error {
  constructor(message, childMessage) {
    super(message);
    this.childMessage = childMessage;
  }
}

export const MESSAGES = {
  busy: 'Lots of people are making things right now. Try again in a minute.',
  blocked: "That idea can't be made. Try something different!",
  quota: "Today's free building time has run out. Ask a grown-up to switch to the other maker.",
  notConfigured: 'This maker is not set up yet. Ask a grown-up to add its key.',
  failed: 'Something went wrong while making it. Please try again.',
  badImage: "That picture didn't work. Try a clear photo or drawing of one thing."
};