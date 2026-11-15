import Svg, { Circle, Path, Polyline, Line } from 'react-native-svg';

type P = { size?: number; color?: string; stroke?: number };
const base = (s = 24) => ({ width: s, height: s, viewBox: '0 0 24 24', fill: 'none' as const });

export const Swords = ({ size, color = '#fff', stroke = 2.2 }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
    <Line x1="13" x2="19" y1="19" y2="13" /><Line x1="16" x2="20" y1="16" y2="20" /><Line x1="19" x2="21" y1="21" y2="19" />
    <Polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
    <Line x1="5" x2="9" y1="14" y2="18" /><Line x1="7" x2="4" y1="17" y2="20" /><Line x1="3" x2="5" y1="19" y2="21" />
  </Svg>
);
export const Home = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);
export const Chat = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" /><Path d="M8.5 11h7M8.5 14.5h4" />
  </Svg>
);
export const Shield = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" /><Path d="m9 12 2 2 4-4" />
  </Svg>
);
export const Crown = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <Path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 11H5z" /><Path d="M5 21h14" />
  </Svg>
);
export const Bell = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
);
export const Search = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.2} strokeLinecap="round"><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></Svg>
);
export const Back = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
);
export const Bolt = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} fill={color}><Path d="M13 2 4 14h6l-1 8 9-12h-6z" /></Svg>
);
export const Del = ({ size, color = '#fff' }: P) => (
  <Svg {...base(size)} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><Path d="m18 9-6 6M12 9l6 6" /></Svg>
);
