import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'level-check',
  plugins: [
    appsInToss({
      brand: {
        displayName: '레벨 체크', // 앱 노출 이름
        primaryColor: '#3182F6', // 기본 브랜드 컬러
        icon: '', // 앱 아이콘 이미지 URL
      },
      permissions: [],
    }),
  ],
});
