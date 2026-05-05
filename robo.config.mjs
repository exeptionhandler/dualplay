export default {
  host: '0.0.0.0',
  port: parseInt(process.env.PORT ?? '10000'),
  sync: true,
  invite: {
    scopes: ['identify', 'rpc.voice.read']
  }
};
