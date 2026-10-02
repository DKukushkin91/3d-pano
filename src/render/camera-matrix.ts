import type { ICameraBasis } from '../math/camera-basis';

/**
 * Пишет оси камеры столбцами матрицы `mat3` (вправо, вверх, вперёд): в шейдере `M · v` переводит вектор
 * из осей камеры в мир, а `v · M` — из мира в оси камеры. Буфер переиспользуется, чтобы не создавать
 * массив каждый кадр.
 */
export const writeCameraMatrix = (target: Float32Array, basis: ICameraBasis): Float32Array => {
  target.set([
    basis.right.x,
    basis.right.y,
    basis.right.z,
    basis.up.x,
    basis.up.y,
    basis.up.z,
    basis.forward.x,
    basis.forward.y,
    basis.forward.z,
  ]);

  return target;
};
