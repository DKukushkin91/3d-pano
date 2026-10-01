import { EnumFovMode, type TFovMode } from '../tour/tour-dictionaries';

/**
 * Половины углов обзора по ширине и высоте кадра в виде тангенсов: именно они масштабируют луч
 * прямолинейной проекции, поэтому шейдер и `project` получают их, а не углы.
 */
export interface IHalfTangents {
  width: number;
  height: number;
}

/**
 * `aspect` — ширина кадра, делённая на высоту. Режим `max` относит угол к большей стороне: в альбомном
 * кадре это ширина, в портретном — высота.
 */
export const halfTangentsFromFov = (fov: number, fovMode: TFovMode, aspect: number): IHalfTangents => {
  const tangent = Math.tan(fov / 2);

  if (fovMode === EnumFovMode.Horizontal || (fovMode === EnumFovMode.Max && aspect >= 1)) {
    return { width: tangent, height: tangent / aspect };
  }

  if (fovMode === EnumFovMode.Vertical || fovMode === EnumFovMode.Max) {
    return { width: tangent * aspect, height: tangent };
  }

  const height = tangent / Math.hypot(aspect, 1);

  return { width: height * aspect, height };
};

/**
 * Обратная к `halfTangentsFromFov`: угол обзора в заданном режиме по тангенсам кадра. Нужна, когда
 * ограничение считается по одной стороне (например, по высоте), а вид хранится в режиме хоста.
 */
export const fovFromHalfTangents = (
  halfTangents: IHalfTangents,
  fovMode: TFovMode,
  aspect: number,
): number => {
  if (fovMode === EnumFovMode.Horizontal || (fovMode === EnumFovMode.Max && aspect >= 1)) {
    return 2 * Math.atan(halfTangents.width);
  }

  if (fovMode === EnumFovMode.Vertical || fovMode === EnumFovMode.Max) {
    return 2 * Math.atan(halfTangents.height);
  }

  return 2 * Math.atan(Math.hypot(halfTangents.width, halfTangents.height));
};
