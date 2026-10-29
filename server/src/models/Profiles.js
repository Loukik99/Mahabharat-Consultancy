const mongoose = require("mongoose");

const PROFILE_ENUMS = {
  gender: ["male", "female", "transgender"],
  category: ["general", "ews", "obc", "sc", "st"],
  maritalStatus: ["unmarried", "married", "widowed", "divorced", "separated"],
};

const addressSchema = new mongoose.Schema(
  { line: String, village: String, tehsil: String, district: String, state: String, pincode: String },
  { _id: false }
);

const educationSchema = new mongoose.Schema(
  { board: String, rollNumber: String, passingYear: Number, percentage: Number },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  { examName: String, applicationNumber: String, rollNumber: String, examCentre: String, examDate: String },
  { _id: false }
);

// Reusable applicant profile (one per customer), kept separate from the auth User record.
// All fields are optional; validation lives in controllers/profileController.js.
const customerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    personal: {
      fullName: String,
      fatherName: String,
      motherName: String,
      dob: String, // YYYY-MM-DD, same format as ServiceRequest.applicantDetails.dob
      gender: String,
      category: String,
      religion: String,
      maritalStatus: String,
      nationality: String,
    },
    contact: { mobile: String, email: String },
    permanentAddress: addressSchema,
    correspondenceAddress: addressSchema,
    education: { tenth: educationSchema, twelfth: educationSchema, graduation: educationSchema },
    exams: { type: [examSchema], default: undefined },
    // Masked only (last four characters, e.g. XXXX-XXXX-1234 / XXXXXX234F). Never full numbers.
    aadhaarRef: String,
    panRef: String,
    notes: String,
  },
  { timestamps: true }
);

const agentProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    specialties: [String],
    bio: String,
  },
  { timestamps: true }
);

module.exports = {
  PROFILE_ENUMS,
  CustomerProfile: mongoose.model("CustomerProfile", customerProfileSchema),
  AgentProfile: mongoose.model("AgentProfile", agentProfileSchema),
};
