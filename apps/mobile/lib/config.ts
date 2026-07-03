import Constants from "expo-constants";
import { Platform } from "react-native";

const localhost = Platform.select({
  android: "10.0.2.2",
  default: "localhost",
});

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  Constants.expoConfig?.extra?.apiUrl ??
  `http://${localhost}:9001`;

export const APP_SCHEME = "thetextapp";
