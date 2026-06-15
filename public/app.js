// State Management
let currentStep = 1;
const totalSteps = 3;

// Elements
const form = document.getElementById('applicationForm');
const steps = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3')
];
const progressNodes = [
    document.getElementById('node1'),
    document.getElementById('node2'),
    document.getElementById('node3'),
    document.getElementById('node4')
];
const progressBar = document.getElementById('progressBar');
const mobileStepCounter = document.getElementById('mobileStepCounter');
const successScreen = document.getElementById('successScreen');
const formCard = document.querySelector('.form-card');
const submitBtn = document.getElementById('submitBtn');

// Step Names for Mobile Label
const stepNames = [
    "Personal Details",
    "College & Academics",
    "Mindset & Vision"
];

// Character Count Config
const charLimitConfig = {
    q1: { min: 20, span: document.getElementById('q1Char'), error: document.getElementById('q1Error') },
    q2: { min: 20, span: document.getElementById('q2Char'), error: document.getElementById('q2Error') },
    q3: { min: 20, span: document.getElementById('q3Char'), error: document.getElementById('q3Error') },
    q5: { min: 20, span: document.getElementById('q5Char'), error: document.getElementById('q5Error') }
};

// Initialize listeners
document.addEventListener('DOMContentLoaded', () => {
    // Character Limit Listeners
    Object.keys(charLimitConfig).forEach(id => {
        const textarea = document.getElementById(id);
        if (textarea) {
            textarea.addEventListener('input', () => updateCharCount(id, textarea.value));
        }
    });

    // Form Submit Listener
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
    
    // Set initial stepper progress
    updateUI();
});

// Update character counts dynamically
function updateCharCount(id, text) {
    const config = charLimitConfig[id];
    const length = text.trim().length;
    config.span.textContent = length;

    const counterDiv = config.span.parentElement;
    if (length >= config.min) {
        counterDiv.classList.add('met');
    } else {
        counterDiv.classList.remove('met');
    }
}

// Validation Functions
function validateEmail(email) {
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    return gmailRegex.test(email.trim().toLowerCase());
}

function validatePhone(phone) {
    const phoneRegex = /^\d{10}$/;
    return phoneRegex.test(phone.trim());
}

function validateUrl(url) {
    if (!url.trim()) return true; // Optional field
    try {
        new URL(url);
        return true;
    } catch (_) {
        return false;
    }
}



function validateStep(stepNum) {
    let isValid = true;

    // Helper to toggle error class
    const setValidity = (fieldId, isValidField) => {
        const fieldEl = document.getElementById(fieldId);
        if (!fieldEl) return;
        const group = fieldEl.closest('.form-group');
        if (isValidField) {
            group.classList.remove('invalid');
        } else {
            group.classList.add('invalid');
            isValid = false;
        }
    };

    if (stepNum === 1) {
        const nameVal = document.getElementById('name').value;
        const displayNameVal = document.getElementById('displayName').value;
        const emailVal = document.getElementById('email').value;
        const phoneVal = document.getElementById('phone').value;
        const cityVal = document.getElementById('city').value;
        const stateVal = document.getElementById('state').value;

        setValidity('name', nameVal.trim().length > 0);
        setValidity('displayName', displayNameVal.trim().length > 0);
        setValidity('email', validateEmail(emailVal));
        setValidity('phone', validatePhone(phoneVal));
        setValidity('city', cityVal.trim().length > 0);
        setValidity('state', stateVal !== "");
    } 
    
    else if (stepNum === 2) {
        const collegeVal = document.getElementById('collegeName').value;
        const colCityVal = document.getElementById('collegeCity').value;
        const colStateVal = document.getElementById('collegeState').value;
        const branchVal = document.getElementById('branch').value;
        const yearVal = document.getElementById('year').value;
        const linkedinVal = document.getElementById('linkedin').value;
        const githubVal = document.getElementById('github').value;

        setValidity('collegeName', collegeVal.trim().length > 0);
        setValidity('collegeCity', colCityVal.trim().length > 0);
        setValidity('collegeState', colStateVal !== "");
        setValidity('branch', branchVal !== "");
        setValidity('year', yearVal !== "");
        setValidity('linkedin', validateUrl(linkedinVal));
        setValidity('github', validateUrl(githubVal));
    } 
    
    else if (stepNum === 3) {
        const q4Val = document.getElementById('q4').value;
        const q1Val = document.getElementById('q1').value;
        const q2Val = document.getElementById('q2').value;
        const q3Val = document.getElementById('q3').value;
        const q5Val = document.getElementById('q5').value;

        setValidity('q4', q4Val !== "");
        setValidity('q1', q1Val.trim().length >= charLimitConfig.q1.min);
        setValidity('q2', q2Val.trim().length >= charLimitConfig.q2.min);
        setValidity('q3', q3Val.trim().length >= charLimitConfig.q3.min);
        setValidity('q5', q5Val.trim().length >= charLimitConfig.q5.min);
    }

    return isValid;
}

// Navigation Controls
function nextStep(stepNum) {
    if (!validateStep(stepNum)) {
        // Find first invalid input and scroll to it
        const firstInvalid = steps[stepNum - 1].querySelector('.form-group.invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    if (currentStep < totalSteps) {
        // Switch Active Class
        steps[currentStep - 1].classList.remove('active');
        currentStep++;
        steps[currentStep - 1].classList.add('active');
        
        // Scroll to card top
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        updateUI();
    }
}

function prevStep(stepNum) {
    if (currentStep > 1) {
        // Switch Active Class
        steps[currentStep - 1].classList.remove('active');
        currentStep--;
        steps[currentStep - 1].classList.add('active');
        
        // Scroll to card top
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        updateUI();
    }
}

// Update Header Steps & Progress Bar (4-Step Stepper)
function updateUI() {
    // Set progress bar widths based on current step
    let percent = 12.5; // Step 1 is centered at 12.5% progress
    if (currentStep === 2) percent = 37.5;
    if (currentStep === 3) percent = 62.5;
    if (currentStep === 4) percent = 100; // Success access state
    
    progressBar.style.width = `${percent}%`;

    // Mobile Step Text
    if (currentStep <= totalSteps) {
        mobileStepCounter.textContent = `Step ${currentStep} of ${totalSteps}: ${stepNames[currentStep - 1]}`;
    } else {
        mobileStepCounter.textContent = `Completed`;
    }

    // Update Stepper Node states
    progressNodes.forEach((node, index) => {
        const nodeNum = index + 1;
        node.classList.remove('active', 'completed');
        
        if (nodeNum === currentStep) {
            node.classList.add('active');
        } else if (nodeNum < currentStep) {
            node.classList.add('completed');
        }
    });
}

// Form Submission
async function handleFormSubmit(e) {
    e.preventDefault();

    // Final check for Step 3 validation
    if (!validateStep(3)) {
        const firstInvalid = steps[2].querySelector('.form-group.invalid');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    // Set Loading state
    submitBtn.disabled = true;
    const loaderIcon = submitBtn.querySelector('.submit-loader');
    if (loaderIcon) loaderIcon.style.display = 'inline-block';

    // Build form data object
    const formData = {
        name: document.getElementById('name').value,
        displayName: document.getElementById('displayName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        state: document.getElementById('state').value,
        city: document.getElementById('city').value,
        linkedin: document.getElementById('linkedin').value,
        github: document.getElementById('github').value,
        collegeName: document.getElementById('collegeName').value,
        collegeCity: document.getElementById('collegeCity').value,
        collegeState: document.getElementById('collegeState').value,
        branch: document.getElementById('branch').value,
        year: document.getElementById('year').value,
        q4: document.getElementById('q4').value,
        q1: document.getElementById('q1').value,
        q2: document.getElementById('q2').value,
        q3: document.getElementById('q3').value,
        q5: document.getElementById('q5').value
    };

    try {
        const response = await fetch('/api/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            // Move stepper to access stage (4)
            currentStep = 4;
            updateUI();

            // Hide form & stepper labels, show success screen
            form.style.display = 'none';
            document.querySelector('.steps-indicators').style.display = 'none';
            document.querySelector('.stepper-line-bg').style.display = 'none';
            
            successScreen.style.display = 'flex';
            // Trigger animation frame for transition
            setTimeout(() => {
                successScreen.classList.add('active');
            }, 50);

            // Scroll to success screen
            formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            alert(result.error || 'Something went wrong. Please try again.');
        }
    } catch (err) {
        console.error(err);
        alert('Network error. Please make sure your server is running and try again.');
    } finally {
        submitBtn.disabled = false;
        if (loaderIcon) loaderIcon.style.display = 'none';
    }
}

// Status Modal Navigation & Query handlers
function openStatusModal() {
    const modal = document.getElementById('statusModal');
    modal.classList.add('active');
    
    // Clear previous details
    document.getElementById('statusPhoneInput').value = '';
    document.getElementById('statusPhoneInput').closest('.form-group').classList.remove('invalid');
    document.getElementById('statusResultBox').style.display = 'none';
}

function closeStatusModal() {
    document.getElementById('statusModal').classList.remove('active');
}

async function queryStatus() {
    const phoneInput = document.getElementById('statusPhoneInput');
    const phoneVal = phoneInput.value.trim();
    const resultBox = document.getElementById('statusResultBox');
    const nameSpan = document.getElementById('resName');
    const badgeSpan = document.getElementById('resStatusBadge');
    const msgPara = document.getElementById('resMessage');
    const fetchBtn = document.getElementById('fetchStatusBtn');

    // Basic Validation
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phoneVal)) {
        phoneInput.closest('.form-group').classList.add('invalid');
        return;
    } else {
        phoneInput.closest('.form-group').classList.remove('invalid');
    }

    // Load state
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Searching...';
    resultBox.style.display = 'none';

    try {
        const response = await fetch(`/api/status?phone=${phoneVal}`);
        const result = await response.json();

        resultBox.style.display = 'block';

        if (response.ok) {
            nameSpan.textContent = result.name;
            badgeSpan.textContent = result.status;
            badgeSpan.className = `status-pill ${result.status.toLowerCase()}`;

            if (result.status === 'Approved') {
                msgPara.textContent = `Congratulations! Your application has been approved. 🎉 Please check your WhatsApp messages or Email inbox for your exclusive Discord community invitation link.`;
            } else if (result.status === 'Pending') {
                msgPara.textContent = `Your application is currently under manual review. ⏳ We check every profile to ensure a high-quality community of builders. We will message you with a final decision within 48 hours.`;
            } else if (result.status === 'Rejected') {
                msgPara.textContent = `Thank you for your interest in Pragen.ai. Unfortunately, we are unable to accept your application at this time. We encourage you to keep building and wish you the best.`;
            }
        } else {
            nameSpan.textContent = 'Not Found';
            badgeSpan.textContent = 'N/A';
            badgeSpan.className = 'status-pill rejected';
            msgPara.textContent = result.error || 'No application was found matching this phone number. Make sure the 10-digit number is correct, or fill out the form to apply!';
        }
    } catch (err) {
        console.error(err);
        resultBox.style.display = 'block';
        nameSpan.textContent = 'Error';
        badgeSpan.textContent = 'Failed';
        badgeSpan.className = 'status-pill rejected';
        msgPara.textContent = 'Failed to connect to the server. Please verify your internet connection and make sure the server is online.';
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Check Status';
    }
}
