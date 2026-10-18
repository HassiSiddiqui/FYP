# SilentAssist: All Required FYP Midterm Diagrams (Mermaid.js & Eraser.io Prompts)

This document contains the complete diagram specifications for the SilentAssist FYP Midterm Report.

You can render and export these diagrams in two ways:
1. **Mermaid Live Editor:** Copy any ````mermaid```` block into [mermaid.live](https://mermaid.live) and export as PNG/SVG.
2. **Eraser.io AI:** Copy the provided **Eraser.io Prompts** into [eraser.io](https://eraser.io) to generate modern diagram cards.

---

## 1. Figure 2.1: Use-Case Diagram

### Mermaid.js Code
```mermaid
graph LR
    subgraph Actors
        Patient["fa:fa-user Patient (Locked-In)"]
        Caregiver["fa:fa-user-nurse Caregiver (Supervisor)"]
        Admin["fa:fa-user-shield Clinician / Admin"]
    end

    subgraph SilentAssist ["SilentAssist Platform System Boundary"]
        UC1(["Calibrate EEG & Select Mode"])
        UC2(["Navigate Assistive Hub"])
        UC3(["Decode Motor Imagery Intent"])
        UC4(["Resolve Context via CogLign KG"])
        UC5(["Execute Context-Aware Action"])
        UC6(["Observe Post-Action EEG"])
        UC7(["Rollback Action via ErrP"])
        UC8(["Request Caregiver Approval"])
        UC9(["Approve / Reject Hazard Queue"])
        UC10(["Inspect Cryptographic Audit Log"])
        UC11(["Seed Ontology & Configure Devices"])
    end

    Patient --> UC1
    Patient --> UC2
    Patient --> UC5

    UC2 -. "<<include>>" .-> UC3
    UC5 -. "<<include>>" .-> UC4
    UC5 -. "<<include>>" .-> UC6
    UC6 -. "<<extend>>" .-> UC7
    UC5 -. "<<extend>>" .-> UC8

    Caregiver --> UC9
    Caregiver --> UC10

    Admin --> UC11
    Admin --> UC10
```

### Eraser.io Prompt
> "Create a formal UML Use-Case diagram for an assistive smart-home BCI called SilentAssist. Primary Actor: Patient with motor impairment (ALS/tetraplegia). Secondary Actor: Caregiver. Admin Actor: Clinician. Inside the system boundary, show use cases: Calibrate EEG & Select Mode, Navigate Assistive Hub, Decode Motor Imagery Intent, Resolve Context via CogLign KG, Execute Context-Aware Action, Observe Post-Action EEG, Rollback Action via ErrP, Request Caregiver Approval, Approve / Reject Hazard Queue, Inspect Cryptographic Audit Log, and Seed Ontology. Use dashed arrows with <<include>> from Execute Action to Resolve Context and Observe Post-Action EEG, and <<extend>> to Rollback Action via ErrP and Request Caregiver Approval."

---

## 2. Figure 3.1: System Architecture Diagram (5-Layer)

### Mermaid.js Code
```mermaid
graph TD
    subgraph L1 ["Layer 1: Neural Acquisition & Input Simulation"]
        A1["22-Channel EEG Stream (BCI IV-2a)"]
        A2["BNCI 013-2015 Monitoring ErrP Epochs"]
        A3["Operator Input Simulator (4-Token Nav)"]
    end

    subgraph L2 ["Layer 2: Neurotechnology & Deep Graph Layer"]
        B1["Phase Locking Value (PLV) Hilbert Graph"]
        B2["8-Band Welch PSD Filter Bank (8-40 Hz)"]
        B3["SFE-GAT Deep Neural Network (GATv2 + GAE)"]
        B4["Shrinkage LDA + Platt-Calibrated ErrP Detector"]
    end

    subgraph L3 ["Layer 3: Semantic Reasoning Layer (CogLign)"]
        C1["ETSI SAREF v4.1.1 + W3C BOT RDF Triplestore"]
        C2["Client-Side SPARQL 1.1 Query Engine"]
        C3["Multi-Attribute Candidate Scoring: S(d)"]
        C4["Dynamic ErrP Memory Penalty Modifier"]
    end

    subgraph L4 ["Layer 4: Safety Policy & Governance Layer"]
        D1["Composite Confidence: c = n * s"]
        D2["4-Tier Risk Engine: Low / Medium / High Risk"]
        D3["Thermal Hazard Interceptor (<18°C or >30°C)"]
        D4["Atomic Rollback & Bedside Lamp Suggestion"]
    end

    subgraph L5 ["Layer 5: Presentation & Supervision Layer"]
        E1["6 Accessible Patient Screens (Clinical-Calm Dark UI)"]
        E2["Web Speech API Auditory Feedback"]
        E3["Caregiver Live Shadow Dashboard (Key 'C')"]
        E4["SHA-256 Hash-Chained Tamper-Evident Audit Log"]
    end

    L1 -->|Raw EEG / Trials| L2
    L2 -->|Neural Intent n + Post-Action ErrP q| L3
    L3 -->|Resolved Device & Semantic Score s| L4
    L4 -->|Policy Decision & State Commands| L5
```

### Eraser.io Prompt
> "Draw a 5-layer System Architecture diagram for SilentAssist: Adaptive EEG-Based Assistive Home System. 
> Layer 1: Neural Input (22-channel BCI IV-2a stream, BNCI 013-2015 ErrP epochs, Operator simulation). 
> Layer 2: Neurotechnology (Hilbert PLV graph, 8-band Welch PSD filter bank, SFE-GAT GNN decoder, Shrinkage LDA ErrP detector). 
> Layer 3: Semantic Reasoning (SAREF + BOT RDF Triplestore, Client-side SPARQL engine, Multi-attribute resolver S(d), ErrP penalty modifier). 
> Layer 4: Safety & Policy (Composite confidence c = n * s, 4-tier risk engine, Thermal hazard interceptor, Atomic rollback). 
> Layer 5: Presentation & Governance (6-screen accessible UI, Web Speech API voice synthesis, Caregiver supervision dashboard, SHA-256 tamper-evident audit log). Use arrows connecting layers vertically from top to bottom."

---

## 3. Figure 3.2: Activity Diagram (Swimlane Format)

### Mermaid.js Code
```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient (Brain)
    participant Decoder as SFE-GAT Decoder
    participant KG as CogLign KG (SPARQL)
    participant Policy as Policy Engine
    participant Actuator as Smart Home Actuator
    participant ErrP as ErrP Detector
    actor Caregiver as Caregiver

    Patient->>Decoder: Emits Motor Imagery EEG (22-ch)
    Decoder->>Decoder: Compute PLV Graph + Welch PSD
    Decoder->>Policy: Decoded MI Class + Neural Score (n=0.92)
    Policy->>KG: Query spatial & state context
    KG->>KG: Execute SPARQL BGP query
    KG->>Policy: Resolved Entity (:BedroomCeilingLight, s=0.89)
    Policy->>Policy: Calculate c = n * s (c = 0.8188)

    alt c >= 0.75 and Low/Medium Risk
        Policy->>Actuator: EXECUTE (Turn On Light)
        Actuator-->>Patient: Light State ON (Visual + Auditory)
        Actuator->>ErrP: Start 650ms Observation Window (FCz/Cz)
        
        alt ErrP Detected (q > max(t*, pi))
            ErrP->>Policy: Involuntary Error Detected (q=0.80)
            Policy->>Actuator: ATOMIC ROLLBACK (Restore OFF)
            Actuator-->>Patient: Light State Reverted to OFF
            Policy->>KG: Apply ErrP Penalty (M < 0.9)
            KG->>Policy: Suggest Alternative (:BedsideLamp)
            Policy-->>Patient: Display [Retry Bedside Lamp]
        else No ErrP (q <= max(t*, pi))
            ErrP->>Policy: Action Confirmed
            Policy->>Actuator: Commit State & Append SHA-256 Log
        end

    else High Risk (Thermal Hazard: AC < 18°C)
        Policy->>Caregiver: Route to Approval Queue
        Caregiver->>Policy: Caregiver Reviews & Approves
        Policy->>Actuator: EXECUTE Setpoint 17°C
    else Marginal Confidence (0.50 <= c < 0.75)
        Policy-->>Patient: Prompt Single-Token CONFIRM
    else c < 0.50 or n < 0.40
        Policy-->>Patient: REJECT: 'Not sure, please try again'
    end
```

### Eraser.io Prompt
> "Create a UML Swimlane Activity Diagram for SilentAssist showing intent navigation, policy gating, and ErrP rollback. Swimlanes: Patient, Neural Decoder, CogLign KG, Policy Engine, Smart Home Actuator, ErrP Detector, and Caregiver. Start with Patient motor imagery. Decoder extracts PLV and PSD, yielding neural score n. KG runs SPARQL returning candidate score s. Policy calculates composite confidence c = n * s. Decision diamond: If High Risk (AC < 18°C), branch to Caregiver queue for approval. If c >= 0.75, send EXECUTE command to Actuator. Actuator changes state and opens 650ms EEG observation window. If ErrP detector flags error (q > t*), execute atomic rollback to previous state, apply penalty to KG, and offer Bedside Lamp alternative. If no ErrP, append confirmed event to SHA-256 audit log."

---

## 4. Figure 3.3: Class Diagram (UML 3-Compartment Format)

### Mermaid.js Code
```mermaid
classDiagram
    class EEGTrial {
        +int trialId
        +float[22][1000] signalData
        +int sampleRate
        +string activeRoom
        +getChannels()
    }

    class SFEGATDecoder {
        -GATv2 stemLayer
        -EvolutionBlock[3] evoBlocks
        -Classifier classifier
        +computePLV(signal) : Matrix
        +computeWelchPSD(signal) : Matrix
        +forwardPass(trial) : PredictionResult
    }

    class KnowledgeGraphStore {
        -Triple[515] indexedTriples
        -Map prefixMap
        +loadOntology(ttlString)
        +executeSPARQL(query) : ResultSet
        +applySubClassClosure()
    }

    class IntentResolver {
        -float wT
        -float wS
        -float wX
        -float wR
        +resolve(intent, room) : CandidateList
        +calculateScore(candidate) : float
        +applyErrPPenalty(entityId)
    }

    class Device {
        <<abstract>>
        +string uri
        +string label
        +string state
        +string riskTier
        +executeCommand(cmd) : bool
        +rollbackState() : bool
    }

    class Light {
        +int brightness
        +setBrightness(val)
    }

    class AirConditioner {
        +int temperature
        +string mode
        +setTemperature(val)
    }

    class PolicyEngine {
        -float execLowThreshold
        -float execMedThreshold
        +evaluate(nScore, sScore, device) : Decision
        +isThermalHazard(cmd, val) : bool
    }

    class ErrPDetector {
        -float[72] weights
        -float bias
        -PlattCalibrator calibrator
        +extractFeatures(epoch) : float[72]
        +predictPosterior(epoch, prior) : float
    }

    class AuditChain {
        -AuditBlock[] chain
        +appendBlock(event) : string
        +verifyChain() : bool
        +tamperDemo()
    }

    Device <|-- Light
    Device <|-- AirConditioner
    SFEGATDecoder ..> EEGTrial : decodes
    IntentResolver --> KnowledgeGraphStore : queries
    PolicyEngine --> IntentResolver : requests candidate
    PolicyEngine --> Device : dispatches action
    PolicyEngine --> ErrPDetector : triggers observation
    PolicyEngine --> AuditChain : records event
```

### Eraser.io Prompt
> "Draw a UML Class Diagram for SilentAssist Core Domain Model in 3-compartment format. 
> Classes:
> 1. EEGTrial (attributes: trialId, signalData, sampleRate; methods: getChannels()).
> 2. SFEGATDecoder (attributes: stemLayer, evoBlocks, classifier; methods: computePLV(), computeWelchPSD(), forwardPass()).
> 3. KnowledgeGraphStore (attributes: indexedTriples, prefixMap; methods: loadOntology(), executeSPARQL()).
> 4. IntentResolver (attributes: wT, wS, wX, wR; methods: resolve(), calculateScore(), applyErrPPenalty()).
> 5. Device (abstract, attributes: uri, label, state, riskTier; methods: executeCommand(), rollbackState()).
> 6. Light (inherits Device, attributes: brightness).
> 7. AirConditioner (inherits Device, attributes: temperature, mode).
> 8. PolicyEngine (attributes: execLowThreshold, execMedThreshold; methods: evaluate(), isThermalHazard()).
> 9. ErrPDetector (attributes: weights, bias; methods: extractFeatures(), predictPosterior()).
> 10. AuditChain (attributes: chain; methods: appendBlock(), verifyChain()).
> Connect Device inheritance, and link PolicyEngine to IntentResolver, Device, ErrPDetector, and AuditChain."

---

## 5. Figure 3.4: Sequence Diagram (Detailed Object Interaction)

### Mermaid.js Code
```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant UI as UINavigator (POC)
    participant Decoder as SFEGATDecoder
    participant Resolver as CogLignResolver
    participant Policy as PolicyEngine
    participant Device as ApplianceShadow
    participant ErrP as ErrPDetector
    participant Audit as AuditChain

    Patient->>UI: Selects "Turn On" (:BedroomCeilingLight)
    UI->>Decoder: Request Intent & Confidence
    Decoder-->>UI: Intent: TurnOn, Neural Score n = 0.92
    UI->>Resolver: Resolve(:BedroomCeilingLight, room="Bedroom")
    Resolver->>Resolver: Run SPARQL BGP query
    Resolver-->>UI: Match Score S=0.94, Semantic Score s = 0.89
    UI->>Policy: Evaluate(n=0.92, s=0.89, Tier="Low")
    Policy->>Policy: c = 0.92 * 0.89 = 0.8188 >= 0.75
    Policy-->>UI: Decision: EXECUTE
    UI->>Device: SetState("ON")
    Device-->>UI: State Changed: OFF -> ON
    UI-->>Patient: Spoken Speech: "Bedroom Ceiling Light Turned On"
    UI->>Audit: AppendEvent("ACTUATION", :BedroomCeilingLight, "ON")

    UI->>ErrP: ObservePostActionEEG(window=650ms, ch=[FCz, Cz])
    
    alt User Experienced Error (Simulate ErrP)
        ErrP-->>UI: ErrP Detected! (Deflection -8.4uV, q=0.80 > t*=0.55)
        UI->>Device: RollbackState("OFF")
        Device-->>UI: Restored Previous State: ON -> OFF
        UI->>Resolver: PenalizeEntity(:BedroomCeilingLight)
        Resolver-->>UI: New Top Candidate: :BedsideLamp (Score 0.88)
        UI->>Audit: AppendEvent("ROLLBACK", :BedroomCeilingLight, "OFF")
        UI-->>Patient: "Action Rolled Back. Suggested: Bedside Lamp [Retry]"
    else User Confirmed Action (No ErrP)
        ErrP-->>UI: Clean EEG (q=0.02 <= t*=0.55)
        UI->>Audit: AppendEvent("CONFIRMED", :BedroomCeilingLight, "ON")
        UI-->>Patient: "No Error Detected. Action Confirmed."
    end
```

### Eraser.io Prompt
> "Generate a UML Sequence Diagram showing a complete interaction in SilentAssist with lifelines: Patient, UINavigator, SFEGATDecoder, CogLignResolver, PolicyEngine, ApplianceShadow, ErrPDetector, and AuditChain. Show synchronous message calls: Patient selects Turn On, UINavigator queries Decoder, Decoder returns n=0.92, Resolver returns s=0.89 via SPARQL, PolicyEngine computes c=0.8188 and returns EXECUTE. ApplianceShadow updates state to ON, Web Speech speaks confirmation. Then UINavigator calls ErrPDetector. Include an 'alt' box: Option 1: ErrP Detected (deflection -8.4uV, q=0.80 > t*=0.55) -> ApplianceShadow rolls back to OFF, Resolver penalizes fixture and recommends Bedside Lamp. Option 2: Clean EEG -> Action confirmed and appended to AuditChain."

---

## 6. Figure 3.5: Entity-Relationship Diagram (ERD / Ontology Schema)

### Mermaid.js Code
```mermaid
erDiagram
    ROOM ||--o{ DEVICE : "containsElement"
    DEVICE ||--|{ COMMAND : "hasCommand"
    DEVICE ||--|| RISK_TIER : "hasRiskTier"
    DEVICE ||--o{ EXECUTION_LOG : "targetOf"
    EXECUTION_LOG ||--o| ERRP_RECORD : "evaluatedBy"
    EXECUTION_LOG ||--|| AUDIT_BLOCK : "chainedIn"
    CAREGIVER_QUEUE ||--|| EXECUTION_LOG : "authorizes"

    ROOM {
        string room_id PK
        string room_name
        string floor_level
    }

    DEVICE {
        string device_uri PK
        string device_label
        string room_id FK
        string device_type
        string current_state
        string risk_tier_id FK
    }

    COMMAND {
        string command_id PK
        string device_uri FK
        string command_type
        string parameter_schema
    }

    RISK_TIER {
        string tier_id PK
        string tier_name
        float min_confidence_exec
    }

    EXECUTION_LOG {
        string log_id PK
        string device_uri FK
        string command_name
        float neural_confidence
        float semantic_score
        string decision_outcome
        datetime timestamp
    }

    ERRP_RECORD {
        string epoch_id PK
        string log_id FK
        float fcz_amplitude
        float posterior_q
        boolean rollback_triggered
    }

    AUDIT_BLOCK {
        int sequence_num PK
        string prev_hash
        string current_hash
        string event_payload
        datetime timestamp
    }

    CAREGIVER_QUEUE {
        string request_id PK
        string log_id FK
        string reason
        string status
    }
```

### Eraser.io Prompt
> "Draw an Entity-Relationship Diagram (ERD) using Crow's Foot notation for a smart-home healthcare system called SilentAssist. 
> Entities:
> - ROOM (PK room_id, room_name, floor_level).
> - DEVICE (PK device_uri, device_label, FK room_id, device_type, current_state, FK risk_tier_id).
> - COMMAND (PK command_id, FK device_uri, command_type, parameter_schema).
> - RISK_TIER (PK tier_id, tier_name, min_confidence_exec).
> - EXECUTION_LOG (PK log_id, FK device_uri, command_name, neural_confidence, semantic_score, decision_outcome, timestamp).
> - ERRP_RECORD (PK epoch_id, FK log_id, fcz_amplitude, posterior_q, rollback_triggered).
> - AUDIT_BLOCK (PK sequence_num, prev_hash, current_hash, event_payload, timestamp).
> - CAREGIVER_QUEUE (PK request_id, FK log_id, reason, status).
> Relationships: ROOM 1:N DEVICE, DEVICE 1:N COMMAND, DEVICE N:1 RISK_TIER, DEVICE 1:N EXECUTION_LOG, EXECUTION_LOG 1:1 ERRP_RECORD, EXECUTION_LOG 1:1 AUDIT_BLOCK, CAREGIVER_QUEUE 1:1 EXECUTION_LOG."

---

## 7. Figure 3.6: Deployment Diagram

### Mermaid.js Code
```mermaid
graph TD
    subgraph ClientHost ["Node: Client Host Station (Medical Tablet / PC)"]
        subgraph BrowserRuntime ["Execution Environment: Modern Web Browser (Chromium / Edge)"]
            UIBundle["Offline Web App (POC/index.html)"]
            JSEngine["JavaScript Engine (ES6 IIFE on window.SA)"]
            WebSpeech["Web Speech API (Auditory Synthesizer)"]
            CryptoSubtle["Web Crypto API (SHA-256 Chaining)"]
            Storage["Local Cache & Session Storage"]
        end
    end

    subgraph SimulationNode ["Node: BCI Neural Interface Streamer"]
        ReplayEngine["BCI IV-2a & BNCI 013-2015 Epoch Dispatcher"]
        EEGInput["22-Electrode Scalp Montage Buffer"]
    end

    subgraph ResearchStation ["Node: Python ML & DSP Workstation (Offline)"]
        PyTorchEnv["Python 3.14 (.venv)"]
        SFEGATModel["PyTorch Geometric SFE-GAT Engine"]
        ErrPTrainer["Scikit-Learn sLDA Pipeline"]
        Exporter["Automated Parity JS Exporter"]
    end

    subgraph HomeGate ["Node: Domestic Smart Appliance Network"]
        ShadowTable["In-Memory Device Shadow Register"]
        RelayMock["Local Actuator Simulator"]
    end

    SimulationNode -->|ArrayBuffer / Events| JSEngine
    ResearchStation -->|Exported JS Models & Weights| UIBundle
    JSEngine -->|DOM Mutation & State Events| ShadowTable
    JSEngine -->|Audio Event| WebSpeech
    JSEngine -->|Hash Digest| CryptoSubtle
```

### Eraser.io Prompt
> "Draw a UML Deployment Diagram for the SilentAssist Assistive BCI Platform. 
> Show four physical nodes as 3D boxes:
> 1. Client Host Station (PC / Medical Tablet) running a Chromium/Edge browser with components: Offline Web App, JavaScript Engine (window.SA namespace), Web Speech API, Web Crypto API, and Local Storage.
> 2. BCI Neural Streamer node running BCI IV-2a and BNCI 013-2015 replay buffers.
> 3. Python Research Workstation running PyTorch Geometric SFE-GAT training, Scikit-Learn sLDA ErrP pipeline, and automated model weight exporter.
> 4. Domestic Smart Appliance Network node with Device Shadow Register and Local Actuator Simulator. Connect them with protocol labels: Memory Bus, Exported JS Data, and PubSub Events."

---

## 8. Figure 4.1: Closed-Loop Navigation & ErrP Rollback State Machine (FSM)

### Mermaid.js Code
```mermaid
stateDiagram-v2
    [*] --> S1_ModeSelection: Launch Prototype

    S1_ModeSelection --> S2_HomeHub: SELECT (Both Feet)
    S2_HomeHub --> S1_ModeSelection: BACK (Tongue)
    S2_HomeHub --> S2_HomeHub: NEXT (Right Hand) / PREV (Left Hand)

    S2_HomeHub --> S3_FixtureSelection: SELECT (Category: Lights)
    S3_FixtureSelection --> S2_HomeHub: BACK (Tongue)
    S3_FixtureSelection --> S4_ActionSelection: SELECT (Bedroom Ceiling Light)

    S4_ActionSelection --> S3_FixtureSelection: BACK (Tongue)
    S4_ActionSelection --> EvaluatingPolicy: SELECT (Turn On)

    state EvaluatingPolicy {
        [*] --> CheckRisk
        CheckRisk --> CaregiverApprovalRequired: High Risk (AC < 18°C)
        CheckRisk --> ComputeConfidence: Low / Medium Risk
        ComputeConfidence --> RejectAction: c < 0.50 or n < 0.40
        ComputeConfidence --> ConfirmDialog: 0.50 <= c < 0.75
        ComputeConfidence --> ExecuteDirectly: c >= 0.75
    }

    RejectAction --> S4_ActionSelection: Display Warning Banner
    ConfirmDialog --> S4_ActionSelection: CANCEL (Tongue)
    ConfirmDialog --> ExecuteDirectly: CONFIRM (Both Feet)
    CaregiverApprovalRequired --> S4_ActionSelection: Caregiver Rejects
    CaregiverApprovalRequired --> ExecuteDirectly: Caregiver Approves

    ExecuteDirectly --> S5_ObservingPostAction: Mutate Device State (OFF -> ON)

    state S5_ObservingPostAction {
        [*] --> MonitorElectrodes: Listen FCz / Cz (650ms)
        MonitorElectrodes --> DetectErrP: Deflection Detected (q > max(t*, pi))
        MonitorElectrodes --> ActionConfirmed: Clean EEG (q <= max(t*, pi))
    }

    ActionConfirmed --> S2_HomeHub: Action Finalized & Logged
    DetectErrP --> ActionRolledBack: Trigger Atomic Rollback (ON -> OFF)
    ActionRolledBack --> S3_FixtureSelection: Present Alternative (Bedside Lamp)
```

---

## 9. Figure 4.2: CI/CD Pipeline & GitHub Actions Flowchart

### Mermaid.js Code
```mermaid
graph TD
    A["fa:fa-code Git Push / Pull Request (main / develop)"] --> B["Trigger GitHub Actions Runner"]

    subgraph Gate1 ["Gate 1: Lint & Static Syntax"]
        C1["Node.js 20 Setup"]
        C2["node --check on 81 JS Files"]
        C3["Static Architecture Rule Linting"]
    end

    subgraph Gate2 ["Gate 2: Unit & Competency Tests"]
        D1["54 Node.js Core, Safety & UI Tests"]
        D2["54 Knowledge Graph SPARQL Tests (16 CQs)"]
    end

    subgraph Gate3 ["Gate 3: Python Pytest & Parity"]
        E1["Python 3.11 Setup"]
        E2["104 Pytest Suite (DSP, ErrP, SFE-GAT)"]
        E3["Stage-by-Stage Mathematical Parity (<10^-14)"]
    end

    subgraph Gate4 ["Gate 4: Headless Browser E2E Selftest"]
        F1["Launch Headless Edge / Chrome"]
        F2["Execute In-Page Selftest (?selftest=1)"]
        F3["Verify 76/76 In-Browser Passing Assertions"]
    end

    subgraph Gate5 ["Gate 5: Automated Packaging & Release"]
        G1["Package Zero-Build Offline Artifact"]
        G2["Archive Deployable SilentAssist Prototype Bundle"]
    end

    A --> Gate1
    Gate1 --> Gate2
    Gate1 --> Gate3
    Gate2 --> Gate4
    Gate3 --> Gate4
    Gate4 --> Gate5
```

### Eraser.io Prompt
> "Create a modern CI/CD Pipeline Architecture Diagram for GitHub Actions. Top trigger: Git Push or Pull Request to main/develop branches. 
> Show five sequential gates in colored rounded boxes:
> Gate 1: Code Quality & Linting (Syntax check 81 files, architecture constraints).
> Gate 2: Node.js & KG Unit Tests (54 core/safety tests, 54 Knowledge Graph SPARQL competency tests).
> Gate 3: Python & Parity Gate (104 pytest tests, PyTorch vs JavaScript numerical parity with tolerance 1e-14).
> Gate 4: Headless Browser Selftest (Headless Microsoft Edge executing in-page selftest with 76 passing test assertions).
> Gate 5: Automated Deployment & Packaging (Bundling pure offline web prototype zip artifact). 
> Use connecting arrows from Gate 1 down to Gate 5."
