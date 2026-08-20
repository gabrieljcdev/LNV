export const cleanBody = (body) =>
  body
    ?.split('\n')
    .filter(line => !line.trim().startsWith('http'))
    .join('\n')
    .trim() ?? ''

export const extractVideoId = (url) =>
  url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]
