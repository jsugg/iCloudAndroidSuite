import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/index.ts', // Entry point
  output: {
    file: 'dist/bundle.js',
    format: 'cjs',
    sourcemap: true
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' }),
    terser() // Minify the output
  ],
  external: ['some-external-library'] // List external dependencies here
};
