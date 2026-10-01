import { EnumCubeFace, type TCubeFace } from '../tour/tour-dictionaries';
import { type IVector3, createVector3 } from './vector3';

/**
 * Точка на грани куба: `s` растёт вправо, `t` — вниз по изображению грани, обе в диапазоне −1…1.
 */
export interface ICubeFacePoint {
  face: TCubeFace;
  s: number;
  t: number;
}

type TFacePlanePoint = Omit<ICubeFacePoint, 'face'>;

const FACE_DIRECTIONS: Readonly<Record<TCubeFace, (point: TFacePlanePoint) => IVector3>> = {
  [EnumCubeFace.Front]: ({ s, t }) => createVector3(s, -t, 1),
  [EnumCubeFace.Right]: ({ s, t }) => createVector3(1, -t, -s),
  [EnumCubeFace.Back]: ({ s, t }) => createVector3(-s, -t, -1),
  [EnumCubeFace.Left]: ({ s, t }) => createVector3(-1, -t, s),
  [EnumCubeFace.Up]: ({ s, t }) => createVector3(s, 1, t),
  [EnumCubeFace.Down]: ({ s, t }) => createVector3(s, -1, -t),
};

/**
 * Раскладка граней совпадает с `scripts/lib/equirect-to-cube.mjs` neometria, чтобы её готовые грани
 * подходили без перенарезки: нижний край `up` примыкает к верху `front`, верхний край `down` — к его низу.
 * Шейдер содержит ту же таблицу.
 */
export const directionFromCubeFace = (point: ICubeFacePoint): IVector3 => FACE_DIRECTIONS[point.face](point);

const facePointOnHorizontalAxis = ({ x, y, z }: IVector3): ICubeFacePoint =>
  x > 0
    ? { face: EnumCubeFace.Right, s: -z / x, t: -y / x }
    : { face: EnumCubeFace.Left, s: -z / x, t: y / x };

const facePointOnVerticalAxis = ({ x, y, z }: IVector3): ICubeFacePoint =>
  y > 0 ? { face: EnumCubeFace.Up, s: x / y, t: z / y } : { face: EnumCubeFace.Down, s: -x / y, t: z / y };

const facePointOnDepthAxis = ({ x, y, z }: IVector3): ICubeFacePoint =>
  z > 0 ? { face: EnumCubeFace.Front, s: x / z, t: -y / z } : { face: EnumCubeFace.Back, s: x / z, t: y / z };

/**
 * Грань выбирается по наибольшей по модулю компоненте направления; на ребре выигрывает ось в порядке
 * Z, X, Y — на результат это не влияет, у соседних граней на ребре одна и та же точка изображения.
 */
export const cubeFaceFromDirection = (direction: IVector3): ICubeFacePoint => {
  const absoluteX = Math.abs(direction.x);
  const absoluteY = Math.abs(direction.y);
  const absoluteZ = Math.abs(direction.z);

  if (absoluteZ >= absoluteX && absoluteZ >= absoluteY) {
    return facePointOnDepthAxis(direction);
  }

  if (absoluteX >= absoluteY) {
    return facePointOnHorizontalAxis(direction);
  }

  return facePointOnVerticalAxis(direction);
};

/**
 * Перевод координат грани в текстурные: `u` слева направо, `v` сверху вниз, 0…1.
 */
export const textureCoordinatesFromFacePoint = ({ s, t }: ICubeFacePoint): { u: number; v: number } => ({
  u: (s + 1) / 2,
  v: (t + 1) / 2,
});
