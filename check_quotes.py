with open('components/store/StoreClient.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
line = lines[286]
print('Line:', repr(line))
# Check for " in the string
if '"' in line:
    print('Found " entity')
else:
    print('No " entity found')
# Print chars around position 40
print('Chars 38-50:', repr(line[38:50]))