const path = require('path');

module.exports = {
  entry: './src/index.ts', // hoặc file entry của bạn
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'], // cho phép import không cần ghi đuôi
  },
  module: {
    rules: [
      {
        test: /\.ts$/, // áp dụng cho file .ts
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'development', // hoặc 'production'
};
