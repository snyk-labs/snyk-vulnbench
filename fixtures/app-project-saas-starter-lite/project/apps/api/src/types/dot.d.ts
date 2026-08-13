declare module 'dot' {
  const dot: {
    template(template: string): (data: Record<string, unknown>) => string;
  };

  export = dot;
}
