import Btn from './Btn'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { useI18n } from '@/lang'


export default () => {
  const t = useI18n()
  const handleShowCommentScreen = () => {
    navigations.pushCommentScreen(commonState.componentIds.playDetail!)
  }

  return <Btn icon="comment" onPress={handleShowCommentScreen} accessibilityLabel={t('comment_btn')} />
}
