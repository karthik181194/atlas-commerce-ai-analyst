import { generateCustomers } from './customers/customer-generator';
import { generateReferenceData } from './reference-data/reference-data';
const reference = generateReferenceData();
console.table(generateCustomers().map((customer) => ({ ID: customer.customerId, Name: `${customer.firstName} ${customer.lastName}`, Email: customer.email, Region: reference.regions.find((region) => region.regionId === customer.regionId)?.regionName, Segment: reference.customerSegments.find((segment) => segment.segmentId === customer.segmentId)?.segmentName, 'Signup Date': customer.signupDate })));
