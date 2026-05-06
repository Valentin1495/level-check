import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'level-check',
  plugins: [
    appsInToss({
      brand: {
        displayName: '레벨 체크', // 앱 노출 이름
        primaryColor: '#0064ff', // 기본 브랜드 컬러
        icon: 'https://static.toss.im/appsintoss/25061/f7b55d39-7459-4730-b8b5-87497e4b2a1b.png', // 앱 아이콘 이미지 URL
      },
      permissions: [],
    }),
  ],
});
