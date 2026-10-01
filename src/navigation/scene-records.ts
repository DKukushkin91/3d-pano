import type { IScene } from '../tour/tour-types';
import type {
  INavigatorSession,
  ISceneNavigatorHost,
  ISceneRecord,
  ISceneSessionState,
} from './navigator-types';
import { sceneKeyOf } from './scene-key';
import { INITIAL_SESSION_STATE } from './switch-state';

/**
 * Фабрика записей: сессия создаётся хостом, а её изменения уходят в `onChange` вместе с самой записью —
 * навигатор решает, касаются ли они сцены на экране или ожидающей смены.
 */
export const createRecordFactory =
  <TSession extends INavigatorSession>(
    host: Pick<ISceneNavigatorHost<TSession>, 'createSession'>,
    onChange: (record: ISceneRecord<TSession>, state: ISceneSessionState) => void,
  ): ((scene: IScene, withPreview: boolean) => ISceneRecord<TSession>) =>
  (scene, withPreview) => {
    const holder: { record: ISceneRecord<TSession> | null } = { record: null };
    const session = host.createSession(scene, withPreview, (state) => {
      if (holder.record !== null) {
        onChange(holder.record, state);
      }
    });
    const record: ISceneRecord<TSession> = {
      key: sceneKeyOf(scene),
      session,
      state: INITIAL_SESSION_STATE,
      isComplete: false,
    };

    holder.record = record;

    return record;
  };
