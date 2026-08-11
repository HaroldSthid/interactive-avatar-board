# Avatar Board Specification

## Purpose

Provides a real-time gamified presentation board and client interface for classroom interaction, using peer-to-peer connection to synchronize student responses, animate avatar movement, and calculate leaderboard rankings based on accuracy and response speed.

## Requirements

### Requirement: Host Connection Setup
The system MUST generate a unique Room ID on host initialization and MUST establish peer-to-peer listeners using PeerJS to accept incoming client connections.

#### Scenario: Host initializes room
- GIVEN the Host application is loaded
- WHEN the Host triggers room initialization
- THEN the system SHALL generate a unique Room ID
- AND the system MUST open a PeerJS network listener for that Room ID

---

### Requirement: Student Registration and Joining
A student client MUST join an active room by providing a valid Room ID, a traceable Student ID, and selecting a unique hero character avatar.

#### Scenario: Student joins room successfully
- GIVEN the Host has initialized a room with Room ID "ROOM123"
- WHEN a Student client submits "ROOM123", Student ID "STUDENT_A", and selects "Hero-Knight"
- THEN the student client MUST connect to the host
- AND the host board MUST register "STUDENT_A" with the "Hero-Knight" avatar

---

### Requirement: Real-time Answer Submission
The Student client MUST transmit the selected quadrant (A, B, C, or D) and a high-resolution timestamp (milliseconds) upon response submission.

#### Scenario: Student submits an answer
- GIVEN a student client is connected to room "ROOM123"
- WHEN the Student selects quadrant "A" at timestamp 1723400000100
- THEN the student client MUST transmit response "A" and timestamp 1723400000100 to the Host

---

### Requirement: Real-time Visual Race Board
The Host board MUST render student avatars animating towards their selected quadrants with visible Student ID tags, and MUST style them in green (success) or red (failure) when the round ends.

#### Scenario: Host board updates avatar position and final state
- GIVEN a student has submitted quadrant "B"
- WHEN the Host receives the submission
- THEN the Host board MUST animate the student's avatar towards quadrant "B"
- AND the Host board MUST display the Student ID tooltip on hover
- AND the Host board MUST color the avatar green if quadrant "B" is correct, or red if incorrect, at round end

---

### Requirement: Leaderboard and Ranking
The Host board MUST calculate response speed as response timestamp minus question start timestamp, and MUST rank correct answers in ascending order of speed.

#### Scenario: Host compiles leaderboard
- GIVEN a question started at timestamp 1723400000000
- AND Student ID "STUDENT_A" submitted correct quadrant "A" at timestamp 1723400000500 (speed: 500ms)
- AND Student ID "STUDENT_B" submitted correct quadrant "A" at timestamp 1723400000200 (speed: 200ms)
- WHEN the Host processes round results
- THEN the leaderboard MUST rank "STUDENT_B" above "STUDENT_A"

---

### Requirement: Local Simulator Mode
The Host board MUST provide a toggleable offline mode that populates mock student connections and generates randomized quadrant submissions with randomized response times.

#### Scenario: Simulator populates active board
- GIVEN the Host application is offline
- WHEN the user toggles Simulator Mode to "ON"
- THEN the Host MUST generate mock student accounts
- AND the simulator MUST automatically trigger randomized quadrant selections and high-resolution timestamps for all mock students
