# AION UX Reference Document

This document analyzes the UX and UI structure of the AION app to serve as a benchmark for the Sirius design system.

## 1. Onboarding & Authentication
- **Authentication**: Uses a 4-digit PIN code security layer after the initial login/splash.
- **PIN Screen**: 
    - Minimalist layout with a centered card.
    - Clear instructional text ("enter your 4 digits pin code...").
    - Secondary actions for "Forgot pin?" and "Use biometric verification".
    - High-contrast "Submit" button.
- **UX Lesson**: Security should be frictionless but clear. The use of a centered modal for authentication keeps the user focused.

## 2. Main Application Structure
- **Bottom Navigation**:
    - Three primary destinations: **Home**, **History/Schedule**, and **Profile**.
    - Use of a floating-style bottom nav bar with a highlighted active state (circular background for the active icon).
- **Home Dashboard**:
    - **Header**: Personalized greeting ("Hi [Name]") with a welcome message and a "plus" (+) button for quick additions.
    - **Empty State**: When no rooms exist, a clean empty state is shown with a centered icon, a clear headline ("No Rooms Yet"), and a primary call-to-action (CTA) button ("Add a Room").
    - **Layout**: Clean, white/light-grey background with high-contrast primary accents (Teal/Cyan).

## 3. Room & Device Management
- **Add Room Flow**:
    - **Visuals**: Uses high-quality room imagery as a background/header to give the user context.
    - **Configuration**:
        - **Room Type**: Dropdown selection (e.g., Bedroom, Living Room).
        - **Room Name**: Simple text input.
    - **Navigation**: Top-left back button and top-right "Save" button.
- **UX Lesson**: Allowing users to associate a "Type" with a room enables the app to suggest relevant devices or icons automatically.

## 4. Visual Identity & Components
- **Color Palette**:
    - Primary: Cyan/Teal (used for buttons, active states, and branding).
    - Background: Light grey/off-white.
    - Text: Dark grey for primary, medium grey for secondary.
- **Components**:
    - **Buttons**: Rounded corners (pill-shaped), bold white text on primary color.
    - **Inputs**: Clean, outlined text fields with subtle borders.
    - **Badges**: Small, rounded labels for status.
- **Hierarchy**: Home $\rightarrow$ Room $\rightarrow$ Device.

## 5. What Sirius Should Learn
- **Simplicity**: AION avoids clutter. The "No Rooms" state is a great example of guiding a new user.
- **Personalization**: The greeting in the header makes the app feel like a personal assistant.
- **Visual Context**: The use of imagery in the "Add Room" flow makes the setup process feel more tangible.
- **Consistent Navigation**: The bottom nav is always present and intuitive.
