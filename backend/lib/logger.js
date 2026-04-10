function sanitizeContext(value, depth = 0) {
  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeContext(entry, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeContext(entry, depth + 1)])
    );
  }

  return value;
}

function logEvent(level, event, context = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeContext(context)
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  logEvent
};
