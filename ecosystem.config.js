module.exports = {
  apps: [
    {
      // Web application (Next.js)
      name: 'video-editor-web',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      // Background workers (same server)
      name: 'video-editor-workers',
      script: 'npm',
      args: 'run workers',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};