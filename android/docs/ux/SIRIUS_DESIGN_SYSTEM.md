# Sirius Design System

The Sirius Design System defines the visual and structural identity of the Sirius smart-home application. It is inspired by the minimalist and intuitive approach of AION, adapted for a premium Egyptian smart-home product.

**Official Visual Reference:** `docs/ux/references/sirius-visual-reference.png`

## 1. Brand Direction
Sirius aims to be the "North Star" of the home—guiding, reliable, and elegant.
- **Modern**: Clean lines, ample whitespace, and subtle shadows.
- **Premium**: A palette that feels sophisticated yet accessible.
- **Friendly**: Rounded corners and clear, conversational language.
- **Minimal**: Only the most important information is displayed at any given time.

## 2. Color System

### Core Palette
| Role | Color Hex | Description |
| :--- | :--- | :--- |
| **Primary** | `#007AFF` | Sirius Blue: Trustworthy, modern, and clear. Used for active states, toggles, and primary indicators. |
| **Secondary** | `#5AC8FA` | Sky Blue: For accents and secondary highlights. |
| **Background** | `#F8F9FA` | Off-white: Reduces eye strain and feels airy. |
| **Surface** | `#FFFFFF` | Pure White: For cards and modal backgrounds. |
| **Text Primary** | `#1C1C1E` | Near Black: Maximum readability for titles. |
| **Text Secondary** | `#8E8E93` | Medium Grey: For labels and hints. |

### Status & State
| State | Color Hex | Usage |
| :--- | :--- | :--- |
| **Success/Online** | `#34C759` | Green: Specifically for connection status ("Connected") and system health. |
| **Warning** | `#FFCC00` | Attention required, standby. |
| **Error** | `#FF3B30` | Critical failure, offline. |
| **Device ON** | `#007AFF` | Sirius Blue: Primary active state for power toggles. |
| **Device OFF** | `#D1D1D6` | Light Grey: Inactive state for power toggles. |
| **Disabled** | `#E5E5EA` | Non-interactive elements. |

## 3. Typography
Using a system-standard sans-serif stack (San Francisco / Roboto).

| Element | Size | Weight | Color | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Screen Title** | 28px | Bold | Text Primary | Main page headers (e.g., "Main Light"). |
| **Section Title** | 20px | SemiBold | Text Primary | Room or Group headers (e.g., "My Home Rooms"). |
| **Card Title** | 16px | Medium | Text Primary | Device names within cards. |
| **Body** | 14px | Regular | Text Primary | General descriptions and values. |
| **Secondary** | 12px | Regular | Text Secondary | Labels, IP addresses, and metadata. |
| **Button Text** | 16px | Bold | Primary/White | Call-to-action labels. |
| **Status Text** | 14px | Bold | State Color | "Connected", "OFF", etc. |

## 4. Components & Visual Rules

### Navigation
- **App Header**: Personalized greeting on the left, notification bell on the right.
- **Bottom Navigation**: Standard tab bar with Home, Grid, Notifications, and Profile.
- **Hierarchy**: Dashboard $\rightarrow$ Home View (Rooms) $\rightarrow$ Device Control.

### Screen Specifications
- **Dashboard (My Homes)**: 
    - Home cards with blue border for active selection.
    - Summary metadata (Rooms, Devices, Active count).
    - "+ Add Home" outlined button.
- **Home View (Rooms)**:
    - Expandable room sections.
    - Device list within expanded rooms with pill-shaped power toggles.
    - "+ Add Room" outlined button.
- **Device Control**:
    - Central circular power dial (ON/OFF) with a blue pointer.
    - Decorative "Sirius Sparkle" (four-pointed stars) around the dial.
    - Connection status badge (Green dot + "Connected").
    - Bottom "Information" card with firmware and metadata.

### UI Elements
- **Card Styling**: 
    - Corner Radius: 16px - 24px for a soft, premium feel.
    - Shadows: Subtle, low-blur elevation for surface separation.
    - Active State: Blue border (2px) for selected primary entities.
- **Buttons**:
    - Primary Action: Outlined buttons with blue text and icons (e.g., "+ Add Room").
    - Power Toggles: Pill-shaped switches (Blue for ON, Grey for OFF).
- **Visual Density**: Low. High usage of whitespace to maintain a clean, uncluttered "premium" experience.
- **Motif**: Use of the "Sirius Sparkle" (four-pointed star) as a subtle decorative element on key control screens.
