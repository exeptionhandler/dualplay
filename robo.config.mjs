export default {
  plugins: [
    ['@robojs/server', {
      cors: true,
      host: '0.0.0.0',
      port: process.env.PORT || 10000
    }],
    ['@robojs/sync', {}]
  ],
  invite: {
    scopes: ['identify', 'rpc.voice.read']
  }
};
