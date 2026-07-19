import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const classes = {
  'MATH-101': { title: 'Foundations of Algebra', seatsAvailable: 4, instructor: 'Prof. Haleem' },
  'CS-220': { title: 'Data Structures', seatsAvailable: 0, instructor: 'Dr. Noor' },
};

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'student-001'), role: 'student' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `edu-${ctx.customer.id}`, expires_in: 1200 },
    };
  },
});

app.tool(
  {
    name: 'course_catalog_search',
    auth: 'required',
    description: 'Search available classes from the course catalog.',
  },
  async () => {
    return { courses: Object.entries(classes).map(([code, meta]) => ({ code, ...meta })) };
  },
);

app.tool(
  {
    name: 'course_enrollment_request',
    auth: 'required',
    description: 'Request enrollment in a class with seat checks.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const courseCode = asString(args.course_code);
    const course = classes[courseCode];
    if (!course) {
      return { accepted: false, error: 'course_not_found' };
    }
    if (course.seatsAvailable <= 0) {
      return { accepted: false, error: 'waitlist_required', waitlistPosition: 3 };
    }
    return {
      accepted: true,
      enrollmentId: `enr-${Date.now()}`,
      courseCode,
      instructor: course.instructor,
    };
  },
);

await app.listen({ port });
console.log('Qefro education endpoint listening on port', port);
